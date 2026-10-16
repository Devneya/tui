// A PTY is a byte transport, not a terminal emulator. Chimney uses the VT100
// primary-device-attributes reply as its query barrier. Answer that standard
// protocol request; unsupported optional probes remain unanswered before it.
export class TerminalReplies {
  pending='';
  feed(data) {
    const input=this.pending+data;
    const replies=[...input.matchAll(/\x1b\[0?c/g)].map(()=>'\x1b[?1;2c');
    const tail=input.slice(input.lastIndexOf('\x1b'));
    this.pending=/^\x1b(?:\[(?:0)?)?$/.test(tail)?tail:'';
    return replies;
  }
}
