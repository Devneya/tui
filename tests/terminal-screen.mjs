// Test-only screen accumulator for the CSI/OSC sequences emitted by Chimney.
// The product continues to use its upstream renderer unchanged.
export class Screen {
  constructor(cols=120,rows=40){this.cols=cols;this.rows=rows;this.row=0;this.col=0;this.cells=[];this.pending='';}
  width(char){const n=char.codePointAt(0);if(/\p{Mark}/u.test(char))return 0;return n>=0x1100&&(n<=0x115f||n>=0x2e80&&n<=0xa4cf||n>=0xac00&&n<=0xd7a3||n>=0xf900&&n<=0xfaff||n>=0xfe10&&n<=0xfe6f||n>=0xff00&&n<=0xff60||n>=0x1f000)?2:1;}
  line(){return this.cells[this.row]??=([]);}
  feed(chunk){
    this.pending+=chunk;
    let i=0;
    while(i<this.pending.length){
      const c=this.pending[i];
      if(c==='\x1b'){
        if(i+1>=this.pending.length)break;
        const next=this.pending[i+1];
        if(next==='['){
          const match=/^\x1b\[([\x20-\x3f]*)([\x40-\x7e])/.exec(this.pending.slice(i));if(!match)break;
          this.csi(match[1],match[2]);i+=match[0].length;continue;
        }
        if(next===']'){
          const end=/\x07|\x1b\\/.exec(this.pending.slice(i+2));if(!end)break;i+=2+end.index+end[0].length;continue;
        }
        if(next==='('||next===')'){if(i+2>=this.pending.length)break;i+=3;continue;}
        i+=2;continue;
      }
      const code=this.pending.codePointAt(i);const char=String.fromCodePoint(code);i+=char.length;
      if(char==='\r'){this.col=0;continue;}
      if(char==='\n'){this.row++;if(this.row>=this.rows){this.cells.shift();this.row=this.rows-1;}continue;}
      if(char==='\b'){this.col=Math.max(0,this.col-1);continue;}
      if(char==='\t'){this.col=Math.min(this.cols-1,(Math.floor(this.col/8)+1)*8);continue;}
      if(code<32||code===127)continue;
      const width=this.width(char);if(width===0)continue;
      if(this.col>=this.cols){this.col=0;this.row=Math.min(this.rows-1,this.row+1);}
      this.line()[this.col]=char;if(width===2)this.line()[this.col+1]='';this.col+=width;
    }
    this.pending=this.pending.slice(i);
  }
  csi(raw,final){
    if(/[?><!]/.test(raw)){if(final==='h'&&raw==='?1049'){this.cells=[];this.row=0;this.col=0;}return;}
    const a=raw.split(';').map(v=>Number(v)||0);const n=a[0]||1;
    switch(final){
      case 'A':this.row=Math.max(0,this.row-n);break;case 'B':this.row=Math.min(this.rows-1,this.row+n);break;
      case 'C':this.col=Math.min(this.cols-1,this.col+n);break;case 'D':this.col=Math.max(0,this.col-n);break;
      case 'E':this.row=Math.min(this.rows-1,this.row+n);this.col=0;break;case 'F':this.row=Math.max(0,this.row-n);this.col=0;break;
      case 'G':this.col=Math.max(0,n-1);break;case 'd':this.row=Math.max(0,n-1);break;
      case 'H':case 'f':this.row=Math.max(0,(a[0]||1)-1);this.col=Math.max(0,(a[1]||1)-1);break;
      case 'J':if(a[0]===2||a[0]===3)this.cells=[];else if(a[0]===0){this.line().length=this.col;this.cells.length=this.row+1;}break;
      case 'K':if(a[0]===2)this.cells[this.row]=[];else if(a[0]===1){for(let i=0;i<=this.col;i++)this.line()[i]=' ';}else this.line().length=this.col;break;
      case 's':this.saved=[this.row,this.col];break;case 'u':if(this.saved)[this.row,this.col]=this.saved;break;
    }
  }
  text(){return Array.from({length:this.rows},(_,row)=>Array.from({length:this.cols},(_,col)=>this.cells[row]?.[col]??' ').join('').trimEnd()).join('\n');}
}
