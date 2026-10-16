#!/usr/bin/env python3
"""Record target-native objects and reject Linux ABI requirements above baseline."""
import argparse
import json
import re
import struct
import subprocess
from pathlib import Path

LINUX_SYSTEM = re.compile(r'^(?:linux-vdso\.so\.\d|ld-linux[^/]*\.so\.\d|lib(?:c|m|dl|pthread|rt|resolv|util|gcc_s|stdc\+\+)\.so\.[0-9.]+)$')
# d3d9 is the OS Direct3D 9 API, not the separately redistributable D3DX SDK:
# https://learn.microsoft.com/en-us/windows/win32/api/d3d9/nf-d3d9-direct3dcreate9
WINDOWS_SYSTEM = set('kernel32 kernelbase ntdll advapi32 bcrypt bcryptprimitives crypt32 cryptbase cryptnet user32 userenv gdi32 gdi32full shell32 shlwapi ole32 oleaut32 combase rpcrt4 ws2_32 mswsock iphlpapi dnsapi netapi32 secur32 sspicli psapi dbghelp version winmm winhttp wininet normaliz powrprof setupapi cfgmgr32 shcore ucrtbase msvcrt comdlg32 comctl32 dwmapi d2d1 d3d9 d3d11 d3d12 d3dcompiler_47 dwrite dxgi dxcore icu usp10 propsys wintrust imagehlp winspool wtsapi32 hid cabinet authz imm32 urlmon ktmw32'.split())

def version(value):
    return tuple(map(int, value.split('.')))

def pe_imports(file):
    """Read normal and delayed PE import tables without a platform toolchain."""
    data = file.read_bytes()
    def unpack(fmt, offset):
        try:
            return struct.unpack_from(fmt, data, offset)
        except struct.error as error:
            raise ValueError('Truncated PE object: '+file.name) from error
    pe, = unpack('<I', 0x3c)
    if data[pe:pe+4] != b'PE\0\0':
        raise ValueError('Invalid PE object: '+file.name)
    machine, count = unpack('<HH', pe+4)
    optional_size, = unpack('<H', pe+20)
    optional = pe+24
    magic, = unpack('<H', optional)
    if magic not in (0x10b, 0x20b):
        raise ValueError('Unsupported PE optional header: '+file.name)
    directories = optional+(112 if magic == 0x20b else 96)
    image_base, = unpack('<Q' if magic == 0x20b else '<I', optional+(24 if magic == 0x20b else 28))
    sections = []
    for i in range(count):
        size, address, raw_size, raw_offset = unpack('<IIII', optional+optional_size+i*40+8)
        sections.append((address, max(size,raw_size), raw_offset))
    def offset(rva):
        for address, size, raw in sections:
            if address <= rva < address+size:
                return raw+rva-address
        raise ValueError('PE import RVA outside sections: '+file.name)
    def name(rva):
        start = offset(rva)
        end = data.find(b'\0', start, start+512)
        if end < 0:
            raise ValueError('Invalid PE import name: '+file.name)
        return data[start:end].decode('ascii').lower()
    imports = set()
    for index, stride in ((1,20),(13,32)):
        rva, size = unpack('<II', directories+index*8)
        if not rva or not size:
            continue
        start = offset(rva)
        for current in range(start, start+size, stride):
            descriptor = unpack('<'+'I'*(stride//4), current)
            if not any(descriptor):
                break
            if index == 1:
                name_rva = descriptor[3]
            else:
                name_rva = descriptor[1] if descriptor[0]&1 else descriptor[1]-image_base
            imports.add(name(name_rva))
    return machine, sorted(imports)

def inventory(root, target):
    root = root.resolve()
    bundled = {}
    for file in root.rglob('*'):
        if file.is_file() and not file.is_symlink():
            bundled.setdefault(file.name.lower(), []).append(file.relative_to(root).as_posix())
    records = []
    for file in sorted(root.rglob('*')):
        if not file.is_file() or file.is_symlink():
            continue
        with file.open('rb') as stream:
            magic = stream.read(20)
        if target.startswith('linux'):
            machine = 62 if target.endswith('x64') else 183
            if magic[:4] != b'\x7fELF' or len(magic)<20 or int.from_bytes(magic[18:20],'little') != machine:
                continue
            if any(part == 'musl' or part.startswith('musl_') or 'linuxmusl' in part for part in file.relative_to(root).parts):
                records.append({'file':file.relative_to(root).as_posix(),'selected':False,'reason':'musl asset; outside GNU/Linux target ABI'})
                continue
            table = subprocess.run(['objdump','-T',str(file)], capture_output=True,text=True,check=False)
            versions = re.findall(r'GLIBC_([0-9.]+)', table.stdout)
            maximum = max(versions,key=lambda v:tuple(map(int,v.split('.')))) if versions else None
            deps = subprocess.run(['ldd',str(file)], capture_output=True,text=True,check=False)
            dependency_text = deps.stdout+deps.stderr
            if 'not found' in dependency_text:
                raise ValueError('Unresolved native dependency: '+str(file.relative_to(root)))
            if deps.returncode and not any(s in dependency_text for s in ['statically linked','not a dynamic executable']):
                raise ValueError('Cannot inspect native dependencies: '+str(file.relative_to(root)))
            if maximum and version(maximum) > (2,35):
                raise ValueError(f'{file.relative_to(root)} requires GLIBC_{maximum}, above 2.35 baseline')
            libraries = []
            for line in deps.stdout.splitlines():
                line = line.strip()
                if not line or 'statically linked' in line:
                    continue
                library = Path(line.split(' => ')[0].split(' (')[0]).name
                if not LINUX_SYSTEM.fullmatch(library):
                    resolved = line.split(' => ',1)[1].split(' (')[0] if ' => ' in line else line.split(' (')[0]
                    if not Path(resolved).resolve().is_relative_to(root):
                        raise ValueError(f'Unbundled non-OS library {library} required by {file.relative_to(root)}')
                libraries.append(library)
            records.append({'file':file.relative_to(root).as_posix(),'glibcMaximum':maximum,'libraries':libraries})
        elif target.startswith('darwin') and magic[:4] in [b'\xcf\xfa\xed\xfe',b'\xfe\xed\xfa\xcf',b'\xca\xfe\xba\xbe',b'\xbe\xba\xfe\xca']:
            cpu = 'arm64' if target.endswith('arm64') else 'x86_64'
            architectures = subprocess.check_output(['lipo','-archs',str(file)],text=True).split()
            if cpu not in architectures:
                records.append({'file':file.relative_to(root).as_posix(),'selected':False,'reason':'Object is for another CPU architecture'})
                continue
            load = subprocess.check_output(['otool','-arch',cpu,'-l',str(file)],text=True)
            minimums = re.findall(r'\bminos\s+([0-9.]+)',load)+re.findall(r'cmd LC_VERSION_MIN_MACOSX\s+cmdsize \d+\s+version ([0-9.]+)',load)
            if not minimums:
                raise ValueError('Missing macOS deployment target: '+str(file.relative_to(root)))
            if any(version(v) > (15,0,0) for v in minimums):
                raise ValueError('Native object exceeds macOS 15 baseline: '+str(file.relative_to(root)))
            deps = subprocess.check_output(['otool','-arch',cpu,'-L',str(file)],text=True)
            libraries = [line.strip().split(' (')[0] for line in deps.splitlines()[1:]]
            for library in libraries:
                if library.startswith(('/usr/lib/','/System/Library/')):
                    continue
                if library.startswith('@') and Path(library).name.lower() in bundled:
                    continue
                raise ValueError(f'Unbundled non-OS library {library} required by {file.relative_to(root)}')
            records.append({'file':file.relative_to(root).as_posix(),'minimumOS':max(minimums,key=version),'libraries':libraries})
        elif target.startswith('windows') and magic[:2] == b'MZ':
            machine, libraries = pe_imports(file)
            if machine != 0x8664:
                records.append({'file':file.relative_to(root).as_posix(),'selected':False,'reason':'Object is for another CPU architecture'})
                continue
            unknown = [library for library in libraries
                       if library.removesuffix('.dll') not in WINDOWS_SYSTEM
                       and not library.startswith(('api-ms-win-','ext-ms-win-'))
                       and library not in bundled]
            if unknown:
                raise ValueError(f'Unbundled libraries requiring OS or redistribution qualification for {file.relative_to(root)}: '+', '.join(unknown))
            records.append({'file':file.relative_to(root).as_posix(),'format':'PE','libraries':libraries,'loadQualification':'doctor and ConPTY acceptance required'})
    if not records:
        raise ValueError('No native objects inventoried')
    return {'schemaVersion':1,'target':target,'objects':records}

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('root',type=Path);p.add_argument('--target',required=True);p.add_argument('--output',type=Path,required=True)
    a=p.parse_args();a.output.parent.mkdir(parents=True,exist_ok=True)
    failure=a.output.with_name(a.output.stem+'-failure.json')
    failure.unlink(missing_ok=True)
    try:
        result=inventory(a.root,a.target)
    except ValueError as error:
        failure.write_text(json.dumps({'schemaVersion':1,'target':a.target,'check':'native-library-inventory','reason':str(error)},indent=2)+'\n',encoding='utf-8')
        raise
    a.output.write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
