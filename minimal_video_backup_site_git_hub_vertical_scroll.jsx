<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Video Backup</title>

<style>
body { margin:0; background:#fff; color:#000; font-family:sans-serif; overflow:hidden; }
.container { height:100vh; width:100vw; position:relative; }
video { width:100%; height:100%; object-fit:cover; }
.overlay { position:absolute; bottom:0; width:100%; padding:16px; background:linear-gradient(to top, rgba(255,255,255,0.8), transparent); }
.controls { position:absolute; top:16px; right:16px; display:flex; flex-direction:column; gap:8px; }
button { border:1px solid #000; background:#fff; padding:8px 12px; }
.center { display:flex; align-items:center; justify-content:center; height:100vh; flex-direction:column; gap:16px; }
</style>
</head>

<body>
<div id="app"></div>

<script>
const OWNER = "jieun0301";
const REPO = "mp4uru";
const BRANCH = "main";
const JSON_PATH = "videos.json";

const RAW_JSON_URL = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${JSON_PATH}`;

let videos = [];
let current = 0;
const app = document.getElementById("app");

async function loadVideos() {
  try {
    const res = await fetch(RAW_JSON_URL, { cache: "no-store" });
    const data = await res.json();
    videos = Array.isArray(data) ? data : [];
  } catch { videos = []; }
  render();
}

function next(){ if(current < videos.length-1) current++; render(); }
function prev(){ if(current > 0) current--; render(); }

let touchStart=0;
document.addEventListener("touchstart",e=>{ touchStart=e.touches[0].clientY; });
document.addEventListener("touchend",e=>{
  const diff = touchStart - e.changedTouches[0].clientY;
  if(diff>60) next(); else if(diff<-60) prev();
});

let wheelLock=false;
document.addEventListener("wheel",e=>{
  if(wheelLock) return;
  wheelLock=true;
  setTimeout(()=>wheelLock=false,400);
  e.deltaY>0 ? next() : prev();
});

function fileToBase64(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.readAsDataURL(file);
    reader.onload=()=>resolve(reader.result.split(",")[1]);
    reader.onerror=reject;
  });
}

function getToken(){
  let token = localStorage.getItem("gh_token");
  if(!token){
    token = prompt("GitHub Token 입력");
    if(token) localStorage.setItem("gh_token", token);
  }
  return token;
}

function extractPathFromUrl(url){
  try{
    const u = new URL(url);
    // /gh/OWNER/REPO@BRANCH/videos/xxx.mp4
    const parts = u.pathname.split("/");
    const ghIndex = parts.indexOf("gh");
    if(ghIndex === -1) return null;

    // gh 다음: OWNER, REPO@BRANCH, ...path
    const pathParts = parts.slice(ghIndex + 3);
    return pathParts.join("/");
  }catch(e){
    return null;
  }
}/${REPO}@${BRANCH}/`;
  const idx = url.indexOf(marker);
  if(idx === -1) return null;
  return url.substring(idx + marker.length);
}

async function deleteCurrent(){
  const token = getToken();
  if(!token) return;

  const v = videos[current];
  if(!v) return;

  if(!confirm("삭제할까?")) return;

  const filePath = extractPathFromUrl(v.url);
  if(!filePath){ alert("경로 파싱 실패"); return; }

  // 1. 파일 삭제
  const fileRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${filePath}`, {
    headers:{ Authorization:`Bearer ${token}` }
  });

  const fileData = await fileRes.json();

  await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${filePath}`, {
    method:"DELETE",
    headers:{ Authorization:`Bearer ${token}`, Accept:"application/vnd.github+json" },
    body: JSON.stringify({ message:"delete video", sha:fileData.sha, branch:BRANCH })
  });

  // 2. JSON 수정
  const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${JSON_PATH}`, {
    headers:{ Authorization:`Bearer ${token}` }
  });

  const json = await res.json();
  const sha = json.sha;
  const decoded = JSON.parse(atob(json.content));

  const updated = decoded.filter(item => item.id !== v.id);

  await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${JSON_PATH}`, {
    method:"PUT",
    headers:{ Authorization:`Bearer ${token}`, Accept:"application/vnd.github+json" },
    body: JSON.stringify({
      message:"delete video from json",
      content:btoa(unescape(encodeURIComponent(JSON.stringify(updated,null,2)))),
      sha,
      branch:BRANCH
    })
  });

  alert("삭제 완료 → 새로고침");
}

async function uploadMultiple(files){
  const token = getToken();
  if(!token) return;

  for(const file of files){
    if(file.size > 90*1024*1024){ alert(file.name+" 파일 너무 큼"); continue; }

    const base64 = await fileToBase64(file);
    const filePath = `videos/${Date.now()}_${file.name}`;

    const uploadRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${filePath}`,
    {
      method:"PUT",
      headers:{ Authorization:`Bearer ${token}`, Accept:"application/vnd.github+json" },
      body:JSON.stringify({ message:"upload video", content:base64, branch:BRANCH })
    });

    if(!uploadRes.ok){
      const err = await uploadRes.json();
      alert(err.message);
      continue;
    }

    const rawUrl = `https://cdn.jsdelivr.net/gh/${OWNER}/${REPO}@${BRANCH}/${filePath}`;

    let decoded=[]; let sha;
    const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${JSON_PATH}`,
      { headers:{ Authorization:`Bearer ${token}` }});

    if(res.status!==404){
      const json = await res.json();
      sha = json.sha;
      decoded = JSON.parse(atob(json.content));
    }

    const updated = [{ id:Date.now(), url:rawUrl, title:file.name }, ...decoded];

    await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${JSON_PATH}`,
    {
      method:"PUT",
      headers:{ Authorization:`Bearer ${token}`, Accept:"application/vnd.github+json" },
      body:JSON.stringify({
        message:"update json",
        content:btoa(unescape(encodeURIComponent(JSON.stringify(updated,null,2)))),
        sha,
        branch:BRANCH
      })
    });
  }

  alert("업로드 완료 → 새로고침");
}

function render(){
  if(videos.length===0){
    app.innerHTML=`
      <div class="center">
        <div>NO VIDEO</div>
        <input type="file" accept="video/*" id="upload" multiple/>
      </div>`;
    document.getElementById("upload").onchange=e=>uploadMultiple(e.target.files);
    return;
  }

  const v = videos[current];

  app.innerHTML=`
    <div class="container">
      <video src="${v.url}" autoplay muted playsinline loop></video>
      <div class="overlay">${v.title}</div>
      <div class="controls">
        <button onclick="prev()">UP</button>
        <button onclick="next()">DOWN</button>
        <button onclick="deleteCurrent()">DELETE</button>
        <button onclick="localStorage.removeItem('gh_token')">RESET</button>
        <input type="file" accept="video/*" id="upload" multiple/>
      </div>
    </div>`;

  document.getElementById("upload").onchange=e=>uploadMultiple(e.target.files);
}

loadVideos();
</script>

</body>
</html>
