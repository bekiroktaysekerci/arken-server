/* Arken Dünyası: Phaser 3 world adapter. HUD and socket state remain in index.html. */
(function(global){
'use strict';
const MAPS={
 map_heng_yue:{name:'Göksel Damar Avlusu',tint:0xffffff},
 map_trial_valley:{name:'Deneme Vadisi',tint:0x9cb8d4},
 map_ji_ruins:{name:'Kadim Kalıntılar',tint:0xc5a5b2},
 map_suzaku:{name:'Kızıl Kanat Toprakları',tint:0xe3a0a0}
};
const ACTORS=[
 {id:'master',x:.27,y:.39,name:'Teknik Ustası',symbol:'✦',color:0xf0c76a,tab:'skillsTab'},
 {id:'alchemist',x:.34,y:.59,name:'Simyacı',symbol:'✧',color:0x8df1ce,tab:'inventoryTab'},
 {id:'guide',x:.79,y:.46,name:'Tarikat Rehberi',symbol:'✥',color:0xe9c18c,tab:'questsTab'},
 {id:'portal',x:.54,y:.28,name:'Âlemler Geçidi',symbol:'◉',color:0x9edaff,tab:'mapTab'}
];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function route(start,goal,width,height,obstacles,cols=40,rows=24){
 if(!width||!height)return [];
 const cell=(p)=>[clamp(Math.floor(p.x/width*cols),0,cols-1),clamp(Math.floor(p.y/height*rows),0,rows-1)];
 const blocked=(x,y)=>obstacles.some(o=>{const nx=(x+.5)/cols,ny=(y+.5)/rows;return nx>=o.x-.012&&nx<=o.x+o.w+.012&&ny>=o.y-.012&&ny<=o.y+o.h+.012;});
 const [sx,sy]=cell(start),[gx,gy]=cell(goal),key=(x,y)=>y*cols+x;
 if(blocked(gx,gy)||blocked(sx,sy))return [];
 const open=[[sx,sy]],parents=new Map(),seen=new Set([key(sx,sy)]);
 for(let i=0;i<open.length;i++){
  const [x,y]=open[i];if(x===gx&&y===gy)break;
  for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
   const nx=x+dx,ny=y+dy,k=key(nx,ny);
   if(nx<0||ny<0||nx>=cols||ny>=rows||blocked(nx,ny)||seen.has(k))continue;
   seen.add(k);parents.set(k,key(x,y));open.push([nx,ny]);
  }
 }
 if(!seen.has(key(gx,gy)))return [];
 const out=[];let at=key(gx,gy),safety=cols*rows;
 while(at!==key(sx,sy)&&safety-->0){const x=at%cols,y=Math.floor(at/cols);out.push({x:(x+.5)*width/cols,y:(y+.5)*height/rows});at=parents.get(at);if(at===undefined)return [];}
 out.reverse();out.push({x:goal.x,y:goal.y});return out;
}
function createAdapter(options){
 const P=global.Phaser;if(!P||!options||!options.parent)return null;
 const parent=options.parent;let game=null,scene=null,mapId='map_heng_yue',geometry={},user=null,remotes=new Map(),moving=[],lastSent=0,lastPosition=null,playerName='Yetişimci';
 const spriteKeys={'Kılıç Ustası':'swordmaster','Ruh Büyücüsü':'spirit-mage','Gölge Suikastçısı':'assassin','Kadim Savaşçı':'ancient-warrior','İklim / Şifacı Ustası':'healer','Gök Ejderha Rahibi':'dragon-priest'};
 const drawActor=(s,x,y,symbol,name,color)=>{
  const c=s.add.container(x,y);const aura=s.add.ellipse(0,0,64,16,0x000000,.55);const ring=s.add.ellipse(0,-3,58,15,color,.28).setStrokeStyle(2,color,.8);
  const glyph=s.add.text(0,-48,symbol,{fontFamily:'Georgia',fontSize:'38px',color:'#ffffff',stroke:'#061124',strokeThickness:5}).setOrigin(.5);
  const title=s.add.text(0,-70,name,{fontFamily:'Arial',fontSize:'12px',fontStyle:'bold',color:'#ffe3a4',stroke:'#071020',strokeThickness:4}).setOrigin(.5);
  c.add([aura,ring,glyph,title]);return c;
 };
 class World extends P.Scene{
  constructor(){super('ArkenWorld');}
  preload(){this.load.image('arken-bg','/assets/temple_courtyard.webp');for(const key of Object.values(spriteKeys))this.load.svg('class-'+key,'/assets/sprites/'+key+'.svg',{width:576,height:672});}
  create(){scene=this;this.cameras.main.setBackgroundColor('#0b1424');
   this.background=this.add.image(0,0,'arken-bg').setOrigin(0).setDepth(0);
   this.obstacleGraphics=this.add.graphics().setDepth(1);
   this.actorLayer=this.add.container(0,0).setDepth(3);
   this.remoteLayer=this.add.container(0,0).setDepth(4);
   this.hero=drawActor(this,0,0,'⚔',playerName,0x8bd8ff).setDepth(5);
   this.heroGlyph=this.hero.list.find(x=>x.type==='Text'&&x.text==='⚔');
   this.heroImage=this.add.image(0,-12,'class-swordmaster').setOrigin(.5,1).setScale(.46);
   this.heroImage.setCrop(0,0,144,168);this.hero.add(this.heroImage);this.heroGlyph?.setVisible(false);
   this.trail=this.add.graphics().setDepth(4);
   this.input.on('pointerdown',pointer=>{
    if(!user||!options.isActive?.())return;
    const x=pointer.x,y=pointer.y;
    moving=route({x:user.x,y:user.y},{x,y},this.scale.width,this.scale.height,geometry[mapId]?.obstacles||[]);
    if(!moving.length)options.onBlocked?.();
   });
   this.scale.on('resize',()=>this.relayout());this.relayout();
  }
  relayout(){const w=this.scale.width,h=this.scale.height;if(!this.background)return;
   this.background.setDisplaySize(w,h);this.actorLayer.removeAll(true);this.obstacleGraphics.clear();
   const obstacles=geometry[mapId]?.obstacles||[];
   obstacles.forEach(o=>{this.obstacleGraphics.fillStyle(0x0d1926,.16);this.obstacleGraphics.fillRoundedRect(o.x*w,o.y*h,o.w*w,o.h*h,8);});
   ACTORS.forEach(a=>{const actor=drawActor(this,a.x*w,a.y*h,a.symbol,a.name,a.color);actor.setSize(110,100).setInteractive(new P.Geom.Rectangle(-55,-85,110,100),P.Geom.Rectangle.Contains);actor.on('pointerdown',pointer=>{pointer.event.stopPropagation();options.onNpc?.(a.tab,a.name);});this.actorLayer.add(actor);});
   if(user){user.x=clamp(user.x,0,w);user.y=clamp(user.y,0,h);this.hero.setPosition(user.x,user.y);}
   this.background.setTint(MAPS[mapId]?.tint||0xffffff);
  }
  update(time,delta){if(!user)return;const w=this.scale.width,h=this.scale.height;
   if(moving.length){const next=moving[0],dx=next.x-user.x,dy=next.y-user.y,dist=Math.hypot(dx,dy),step=Math.min(dist,Math.min(delta,80)*.19);
    if(dist<=step+1){user.x=next.x;user.y=next.y;moving.shift();}else{user.x+=dx/dist*step;user.y+=dy/dist*step;}
    if(time-lastSent>135){lastSent=time;lastPosition={x:Math.round(user.x),y:Math.round(user.y)};options.onMove?.({...lastPosition,viewportWidth:w,viewportHeight:h,mapId});}
   }
   this.hero.setPosition(user.x,user.y);
   if(this.heroImage){const row=moving.length?1:0;this.heroImage.setCrop(Math.floor(time/175)%4*144,row*168,144,168);}
   this.trail.clear();if(moving.length){this.trail.lineStyle(2,0x9edbff,.55);this.trail.strokeCircle(user.x,user.y+4,20);}
   for(const entry of remotes.values()){entry.container.x+=(entry.x-entry.container.x)*Math.min(1,delta/120);entry.container.y+=(entry.y-entry.container.y)*Math.min(1,delta/120);}
  }
 }
 game=new P.Game({type:P.AUTO,parent,width:Math.max(320,parent.clientWidth),height:Math.max(240,parent.clientHeight),transparent:true,render:{pixelArt:false,antialias:true},scale:{mode:P.Scale.RESIZE,autoCenter:P.Scale.NO_CENTER},scene:[World]});
 const api={
  setGeometry(value){geometry=value||{};scene?.relayout();},
  setMap(id){mapId=MAPS[id]?id:'map_heng_yue';moving=[];scene?.relayout();},
  setPlayer(player){playerName=String(player?.username||'Yetişimci');if(!scene)return;const w=scene.scale.width,h=scene.scale.height;user={x:clamp(Number(player?.x)||w*.5,0,w),y:clamp(Number(player?.y)||h*.66,0,h)};scene.hero.list.find(x=>x.type==='Text'&&x!==scene.heroGlyph)?.setText(playerName);
   const atlas='class-'+(spriteKeys[player?.className]||'swordmaster');if(scene.textures.exists(atlas))scene.heroImage?.setTexture(atlas).setCrop(0,0,144,168);
   scene.hero.setPosition(user.x,user.y);},
  correct(pos){if(!user||!pos)return;const d=Math.hypot(user.x-pos.x,user.y-pos.y);if(d>30||pos.blocked){user.x=pos.x;user.y=pos.y;if(pos.blocked)moving=[];}},
  remote(id,name,x,y){if(!scene||!id||!Number.isFinite(x)||!Number.isFinite(y))return;let e=remotes.get(id);if(!e){const c=drawActor(scene,x,y,'✧',String(name||'Oyuncu'),0xe2bbff);scene.remoteLayer.add(c);e={container:c,x,y};remotes.set(id,e);}e.x=x;e.y=y;},
  removeRemote(id){const e=remotes.get(id);if(e){e.container.destroy();remotes.delete(id);}},
  stop(){moving=[];},destroy(){game?.destroy(true);scene=null;game=null;remotes.clear();},get isReady(){return !!scene;}
 };
 return api;
}
global.ArkenWorldEngine={create:createAdapter,findRoute:route,MAPS};
if(typeof module!=='undefined'&&module.exports)module.exports={findRoute:route,MAPS};
})(typeof window!=='undefined'?window:globalThis);
