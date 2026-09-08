<#
  server.ps1 - May chu web noi bo cho App Kho Vat Tu MMV
  Phuc vu app-vat-tu-xuong.html cho moi thiet bi trong cung mang WiFi,
  luu du lieu chung vao data.json tren PC nay.

  Dung .NET HttpListener co san trong Windows - khong can cai Node/Python.

  Tham so:
    -Port <so>   Cong mang (mac dinh 8080)
    -Setup       Chi cai dat 1 lan: mo quyen cong mang (urlacl) + tuong lua, roi thoat
#>
param(
  [int]$Port = 8080,
  [switch]$Setup
)

$ErrorActionPreference = 'Stop'
$Root       = Split-Path -Parent $MyInvocation.MyCommand.Path
$Template   = Join-Path $Root 'app-vat-tu-xuong.html'
$DataFile   = Join-Path $Root 'data.json'
$MarkerFile = Join-Path $Root '.mmv-setup-ok'
$Utf8       = New-Object System.Text.UTF8Encoding($false)

# ---------- che do CAI DAT 1 LAN (chay voi quyen Admin) ----------
if ($Setup) {
  Write-Host "Dang cai dat quyen truy cap mang cho cong $Port ..." -ForegroundColor Cyan
  $who = (whoami).Trim()
  $url = "http://+:$Port/"
  cmd /c "netsh http delete urlacl url=$url" 2>$null | Out-Null
  cmd /c "netsh http add urlacl url=$url user=`"$who`"" | Out-Null
  cmd /c "netsh advfirewall firewall delete rule name=`"MMV Kho Web`"" 2>$null | Out-Null
  cmd /c "netsh advfirewall firewall add rule name=`"MMV Kho Web`" dir=in action=allow protocol=TCP localport=$Port" | Out-Null
  Set-Content -Path $MarkerFile -Value (Get-Date).ToString('s') -Encoding ascii
  Write-Host "Xong. Da mo cong $Port cho cac thiet bi trong mang." -ForegroundColor Green
  Start-Sleep -Seconds 1
  return
}

# ---------- doc template ----------
if (-not (Test-Path $Template)) {
  Write-Host "Khong tim thay $Template" -ForegroundColor Red
  Read-Host "Bam Enter de dong"
  return
}
$TemplateHtml = [System.IO.File]::ReadAllText($Template, $Utf8)

# ---------- helper: lay/ghi state (app-state JSON) ----------
$asOpen  = '<script id="app-state" type="application/json">'
$asClose = '</script>'

function Extract-AppState([string]$html) {
  $i = $html.IndexOf($asOpen)
  if ($i -lt 0) { return $null }
  $s = $i + $asOpen.Length
  $e = $html.IndexOf($asClose, $s)
  if ($e -lt 0) { return $null }
  $json = $html.Substring($s, $e - $s)
  $esc = '\' + 'u003c'
  return $json.Replace($esc, '<')
}

# Neu chua co data.json -> tao tu du lieu goc trong template
if (-not (Test-Path $DataFile)) {
  $seed = Extract-AppState $TemplateHtml
  if (-not $seed) { $seed = '{"log":[],"usersTxt":"","duyet":false}' }
  [System.IO.File]::WriteAllText($DataFile, $seed, $Utf8)
  Write-Host "Da tao data.json (du lieu chung)." -ForegroundColor DarkGray
}

# ---------- shim: cho app luu vao server thay vi runtime claude.ai ----------
$Shim = @'
<script>
/* MMV local server shim: thay runtime claude.ai bang API cua server noi bo */
window.claude = {
  use: function(name){
    if(name === "artifact"){
      return Promise.resolve({
        publish: function(html){
          var m = html.match(/<script id="app-state"[^>]*>([\s\S]*?)<\/script>/);
          var json = m ? m[1].replace(/\\u003c/g, "<") : "";
          return fetch("/api/publish", {
            method: "POST",
            headers: {"Content-Type": "application/json;charset=utf-8"},
            body: json
          }).then(function(r){
            if(r.status === 409) throw {code:"conflict"};
            if(!r.ok) throw {code:"upstream_error"};
          }).then(function(){
            try{ window.__mmvJustSaved = true; }catch(e){}
            setTimeout(function(){ location.reload(); }, 120);
          });
        }
      });
    }
    if(name === "downloads"){
      return Promise.resolve({
        save: function(o){
          try{
            var blob = new Blob([o.data], {type:"application/octet-stream"});
            var url = URL.createObjectURL(blob);
            var a = document.createElement("a");
            a.href = url; a.download = o.filename || "download.txt";
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(function(){ URL.revokeObjectURL(url); }, 1500);
            return Promise.resolve();
          }catch(e){ return Promise.reject({code:"unavailable"}); }
        }
      });
    }
    return Promise.resolve(null);
  }
};

/* Tu dong tai lai khi may khac vua ghi du lieu moi (chi khi dang khong nhap lieu) */
(function(){
  var cur = null;
  function idle(){
    var el = document.activeElement;
    if(el && /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) return false;
    if(document.querySelector('.sheet, .modal, [data-open="1"]')) return false;
    return true;
  }
  function tick(){
    fetch("/api/version", {cache:"no-store"}).then(function(r){return r.text();})
      .then(function(v){
        if(cur === null){ cur = v; return; }
        if(v !== cur && idle()){ location.reload(); }
      }).catch(function(){});
  }
  setInterval(tick, 6000);
})();
</script>
'@

# ---------- dung trang HTML hoan chinh cho moi request ----------
function Build-Page {
  $data = [System.IO.File]::ReadAllText($DataFile, $Utf8)
  $dataEsc = $data.Replace('<', ('\' + 'u003c'))

  $html = $TemplateHtml
  # thay noi dung app-state bang data.json hien tai
  $i = $html.IndexOf($asOpen)
  if ($i -ge 0) {
    $s = $i + $asOpen.Length
    $e = $html.IndexOf($asClose, $s)
    if ($e -ge 0) {
      $html = $html.Substring(0, $s) + $dataEsc + $html.Substring($e)
    }
  }
  # chen shim ngay truoc app-script (CHI lan xuat hien dau tien - tranh chuoi trong buildDoc)
  $marker = '<script id="app-script">'
  $mi = $html.IndexOf($marker)
  if ($mi -ge 0) {
    $html = $html.Substring(0, $mi) + $Shim + "`n" + $html.Substring($mi)
  }

  # boc doctype + head co meta viewport (rat quan trong cho dien thoai)
  $head = @'
<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0b2a4a">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Kho MMV">
</head>
<body>
'@
  return $head + "`n" + $html + "`n</body></html>"
}

function Send-Text($ctx, [string]$text, [string]$type = 'text/html; charset=utf-8', [int]$code = 200) {
  $bytes = $Utf8.GetBytes($text)
  $ctx.Response.StatusCode = $code
  $ctx.Response.ContentType = $type
  $ctx.Response.Headers['Cache-Control'] = 'no-store'
  $ctx.Response.ContentLength64 = $bytes.Length
  $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  $ctx.Response.OutputStream.Close()
}

# ---------- mo HttpListener (uu tien LAN, khong duoc thi localhost) ----------
$listener = New-Object System.Net.HttpListener
$lanOk = $true
try {
  $listener.Prefixes.Add("http://+:$Port/")
  $listener.Start()
} catch {
  $lanOk = $false
  $listener = New-Object System.Net.HttpListener
  try {
    $listener.Prefixes.Add("http://localhost:$Port/")
    $listener.Start()
  } catch {
    Write-Host "Khong mo duoc cong $Port. Co the cong dang bi chiem. Thu port khac." -ForegroundColor Red
    Read-Host "Bam Enter de dong"
    return
  }
}

# ---------- lay dia chi IP LAN ----------
$lanIps = @()
try {
  $lanIps = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -match '^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)' } |
    Select-Object -ExpandProperty IPAddress
} catch {}

try { Clear-Host } catch {}
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host "   APP KHO VAT TU MMV - MAY CHU DANG CHAY" -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Tren MAY NAY (PC), mo trinh duyet:" -ForegroundColor White
Write-Host "     http://localhost:$Port" -ForegroundColor Yellow
Write-Host ""
if ($lanOk -and $lanIps.Count -gt 0) {
  Write-Host "  Tren DIEN THOAI / MAY KHAC (cung WiFi), mo trinh duyet:" -ForegroundColor White
  foreach ($ip in $lanIps) {
    Write-Host "     http://$ip`:$Port" -ForegroundColor Green
  }
  Write-Host ""
  Write-Host "  (iOS/Android/PC deu vao duoc. Tat ca dung CHUNG mot du lieu.)" -ForegroundColor DarkGray
} elseif (-not $lanOk) {
  Write-Host "  * Chi may nay xem duoc (chua mo quyen mang)." -ForegroundColor DarkYellow
  Write-Host "    De dien thoai vao duoc: dong cua so nay, chay lai bang" -ForegroundColor DarkYellow
  Write-Host "    'start-web.bat' va bam YES khi Windows hoi quyen Admin." -ForegroundColor DarkYellow
}
Write-Host ""
Write-Host "  De DUNG may chu: dong cua so nay (hoac bam Ctrl + C)." -ForegroundColor DarkGray
Write-Host "==================================================================" -ForegroundColor Cyan

# tu mo trinh duyet tren PC
try { Start-Process "http://localhost:$Port/" | Out-Null } catch {}

# ---------- vong lap phuc vu ----------
try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    try {
      $path   = $ctx.Request.Url.AbsolutePath
      $method = $ctx.Request.HttpMethod

      if ($path -eq '/favicon.ico') {
        $ctx.Response.StatusCode = 204
        $ctx.Response.OutputStream.Close()
        continue
      }

      if ($path -eq '/api/version') {
        $v = '0'
        if (Test-Path $DataFile) { $v = (Get-Item $DataFile).LastWriteTimeUtc.Ticks.ToString() }
        Send-Text $ctx $v 'text/plain; charset=utf-8'
        continue
      }

      if ($path -eq '/api/state' -and $method -eq 'GET') {
        $data = [System.IO.File]::ReadAllText($DataFile, $Utf8)
        Send-Text $ctx $data 'application/json; charset=utf-8'
        continue
      }

      if ($path -eq '/api/publish' -and $method -eq 'POST') {
        $reader = New-Object System.IO.StreamReader($ctx.Request.InputStream, $Utf8)
        $body = $reader.ReadToEnd()
        $reader.Close()
        $ok = $false
        try { [void]([System.Text.Json.JsonDocument]::Parse($body)); $ok = $true }
        catch {
          try { $null = $body | ConvertFrom-Json; $ok = $true } catch { $ok = $false }
        }
        if (-not $ok -or [string]::IsNullOrWhiteSpace($body)) {
          Send-Text $ctx '{"error":"bad json"}' 'application/json; charset=utf-8' 400
          continue
        }
        # ghi an toan: file tam roi doi ten
        $tmp = $DataFile + '.tmp'
        [System.IO.File]::WriteAllText($tmp, $body, $Utf8)
        [System.IO.File]::Copy($tmp, $DataFile, $true)
        Remove-Item $tmp -ErrorAction SilentlyContinue
        Send-Text $ctx '{"ok":true}' 'application/json; charset=utf-8'
        continue
      }

      if (($path -eq '/' -or $path -eq '/index.html') -and $method -eq 'GET') {
        Send-Text $ctx (Build-Page)
        continue
      }

      # mac dinh: tra ve app (SPA)
      if ($method -eq 'GET') {
        Send-Text $ctx (Build-Page)
        continue
      }

      Send-Text $ctx 'Not found' 'text/plain; charset=utf-8' 404
    } catch {
      try { Send-Text $ctx ('Loi: ' + $_.Exception.Message) 'text/plain; charset=utf-8' 500 } catch {}
    }
  }
} finally {
  $listener.Stop()
  $listener.Close()
}
