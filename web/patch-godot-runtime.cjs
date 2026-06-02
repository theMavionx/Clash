const fs = require('fs');
const path = require('path');

const godotDir = path.resolve(process.argv[2] || path.join(__dirname, 'public', 'godot'));
const workJs = path.join(godotDir, 'Work.js');

const replacements = [
  [
    '_resetSourceStartTime(){this._sourceStartTime=GodotAudio.ctx.currentTime}',
    '_resetSourceStartTime(){this._sourceStartTime=GodotAudio.ctx?GodotAudio.ctx.currentTime:0}',
  ],
  [
    '_restart(){if(this._source!=null){this._source.disconnect()}this._source=GodotAudio.ctx.createBufferSource();',
    '_restart(){if(!GodotAudio.ctx){return}if(this._source!=null){this._source.disconnect()}this._source=GodotAudio.ctx.createBufferSource();',
  ],
  [
    '_pause(){if(!this.isStarted){return}this.isPaused=true;this.pauseTime=(GodotAudio.ctx.currentTime-this._sourceStartTime)/this.getPlaybackRate();this._source.stop()}',
    '_pause(){if(!this.isStarted||!GodotAudio.ctx||!this._source){return}this.isPaused=true;this.pauseTime=(GodotAudio.ctx.currentTime-this._sourceStartTime)/this.getPlaybackRate();this._source.stop()}',
  ],
  [
    '_unpause(){this._restart();this.isPaused=false;this.pauseTime=0}',
    '_unpause(){if(!GodotAudio.ctx){return}this._restart();this.isPaused=false;this.pauseTime=0}',
  ],
];

function patchRuntime() {
  if (!fs.existsSync(workJs)) {
    throw new Error(`Missing Godot Work.js: ${workJs}`);
  }

  let source = fs.readFileSync(workJs, 'utf8');
  let changed = false;

  for (const [from, to] of replacements) {
    const originalCount = source.split(from).length - 1;
    const patchedCount = source.split(to).length - 1;

    if (patchedCount === 1 && originalCount === 0) {
      continue;
    }
    if (originalCount !== 1) {
      throw new Error(`Expected one Godot runtime patch match, found ${originalCount}: ${from}`);
    }

    source = source.replace(from, to);
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(workJs, source);
    console.log(`Patched Godot runtime audio guards in ${workJs}`);
  }
}

patchRuntime();
