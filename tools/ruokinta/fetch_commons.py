#!/usr/bin/env python3
# Fetch the photos of pick.json from Wikimedia Commons into ./raw/<key>.jpg
# (330 px thumbnails) and their authors and licences into ./raw/meta.json.
# Stdlib only. Then: python3 tools/ruokinta/build.py
import json,sys,urllib.parse,urllib.request,time,os,re
UA="RangerGamesQuiz/1.0 (https://github.com/terotests/RangerGames; educational kids game)"
API="https://commons.wikimedia.org/w/api.php"
def fetch(url):
    for k in range(20):
        try: return urllib.request.urlopen(urllib.request.Request(url,headers={"User-Agent":UA}),timeout=60).read()
        except urllib.error.HTTPError as e:
            if e.code in (400,404): print("  bad",e.code,url,flush=True); return b""
            ra=int(e.headers.get("retry-after","20") or 20); print("  wait",ra,e.code,url[:60],flush=True); time.sleep(ra+3)
        except Exception as e:
            print("  err",e,flush=True); time.sleep(10)
    raise SystemExit("fail "+url)
def thumb(u):
    u=u.split("?")[0]
    a,b=u.split("/wikipedia/commons/")
    n=b.split("/")[-1]
    return a+"/wikipedia/commons/thumb/"+b+"/330px-"+n
HERE=os.path.dirname(os.path.abspath(__file__))
os.chdir(HERE)
cands={k:[v["file"]] for k,v in json.load(open("pick.json")).items()}
os.makedirs("raw",exist_ok=True)
mp="raw/meta.json"
meta=json.load(open(mp)) if os.path.exists(mp) else {}
want={t:k for k,v in cands.items() for t in v}
d=json.loads(fetch(API+"?"+urllib.parse.urlencode({"action":"query","format":"json","prop":"imageinfo","titles":"|".join(want),"iiprop":"url|extmetadata","iiurlwidth":500})))
norm={n["to"]:n["from"] for n in d["query"].get("normalized",[])}
for p in d["query"]["pages"].values():
    t=norm.get(p["title"],p["title"]); key=want[t]
    if "imageinfo" not in p: print("MISSING",t,flush=True); continue
    ii=p["imageinfo"][0]; m=ii["extmetadata"]
    g=lambda k: re.sub(r"<[^>]+>","",(m.get(k,{}) or {}).get("value","")).strip()
    fn="raw/%s.jpg"%key
    if not os.path.exists(fn):
        data=fetch(thumb(ii["url"]))
        if not data: continue
        open(fn,"wb").write(data); time.sleep(3)
    meta[key]={"title":p["title"],"page":ii["descriptionurl"],"license":g("LicenseShortName"),"artist":g("Artist") or g("Credit")}
    json.dump(meta,open(mp,"w"),indent=1,ensure_ascii=False)
    print(key,meta[key]["license"],meta[key]["artist"][:60],flush=True)
print("DONE")
