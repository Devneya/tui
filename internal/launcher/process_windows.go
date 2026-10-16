//go:build windows

package launcher

import (
	"fmt"
	"os"
	"os/signal"
	"sort"
	"strings"
	"unicode/utf16"
	"unsafe"

	"golang.org/x/sys/windows"
)

func startNode(node string, args, env []string, cwd string) (int, error) {
	job, err := windows.CreateJobObject(nil, nil)
	if err != nil {
		return 1, err
	}
	defer windows.CloseHandle(job)
	limits := windows.JOBOBJECT_EXTENDED_LIMIT_INFORMATION{}
	limits.BasicLimitInformation.LimitFlags = windows.JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
	if _, err = windows.SetInformationJobObject(job, windows.JobObjectExtendedLimitInformation, uintptr(unsafe.Pointer(&limits)), uint32(unsafe.Sizeof(limits))); err != nil {
		return 1, err
	}
	handles := make([]windows.Handle, 0, 3)
	defer func() {
		for _, h := range handles {
			windows.CloseHandle(h)
		}
	}()
	for _, f := range []*os.File{os.Stdin, os.Stdout, os.Stderr} {
		var duplicate windows.Handle
		if err = windows.DuplicateHandle(windows.CurrentProcess(), windows.Handle(f.Fd()), windows.CurrentProcess(), &duplicate, 0, true, windows.DUPLICATE_SAME_ACCESS); err != nil {
			return 1, err
		}
		handles = append(handles, duplicate)
	}
	attributes, err := windows.NewProcThreadAttributeList(1)
	if err != nil {
		return 1, err
	}
	defer attributes.Delete()
	if err = attributes.Update(windows.PROC_THREAD_ATTRIBUTE_HANDLE_LIST, unsafe.Pointer(&handles[0]), uintptr(len(handles))*unsafe.Sizeof(handles[0])); err != nil {
		return 1, err
	}
	si := windows.StartupInfoEx{}
	si.Cb = uint32(unsafe.Sizeof(si))
	si.Flags = windows.STARTF_USESTDHANDLES
	si.StdInput = handles[0]
	si.StdOutput = handles[1]
	si.StdErr = handles[2]
	si.ProcThreadAttributeList = attributes.List()
	application, err := windows.UTF16PtrFromString(node)
	if err != nil {
		return 1, err
	}
	command, err := windows.UTF16PtrFromString(windows.ComposeCommandLine(append([]string{node}, args...)))
	if err != nil {
		return 1, err
	}
	directory, err := windows.UTF16PtrFromString(cwd)
	if err != nil {
		return 1, err
	}
	sort.Slice(env, func(i, j int) bool { return strings.ToUpper(env[i]) < strings.ToUpper(env[j]) })
	for _, e := range env {
		if strings.IndexByte(e, 0) >= 0 {
			return 1, fmt.Errorf("invalid environment entry")
		}
	}
	block := utf16.Encode([]rune(strings.Join(env, "\x00") + "\x00\x00"))
	// Both processes receive the console event. Consume the supervisor's copy;
	// Node owns terminal input and must not receive a second forwarded interrupt.
	interrupts := make(chan os.Signal, 1)
	signal.Notify(interrupts, os.Interrupt)
	defer signal.Stop(interrupts)
	var pi windows.ProcessInformation
	flags := uint32(windows.CREATE_SUSPENDED | windows.CREATE_UNICODE_ENVIRONMENT | windows.EXTENDED_STARTUPINFO_PRESENT)
	if err = windows.CreateProcess(application, command, nil, nil, true, flags, &block[0], directory, &si.StartupInfo, &pi); err != nil {
		return 1, err
	}
	defer windows.CloseHandle(pi.Process)
	defer windows.CloseHandle(pi.Thread)
	if err = windows.AssignProcessToJobObject(job, pi.Process); err != nil {
		windows.TerminateProcess(pi.Process, 1)
		return 1, fmt.Errorf("cannot supervise Node workers: %w", err)
	}
	if _, err = windows.ResumeThread(pi.Thread); err != nil {
		windows.TerminateProcess(pi.Process, 1)
		return 1, err
	}
	if _, err = windows.WaitForSingleObject(pi.Process, windows.INFINITE); err != nil {
		return 1, err
	}
	var code uint32
	if err = windows.GetExitCodeProcess(pi.Process, &code); err != nil {
		return 1, err
	}
	return int(code), nil
}
