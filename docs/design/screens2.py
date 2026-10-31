import pathlib, importlib.util
spec=importlib.util.spec_from_file_location("gen","gen.py"); g=importlib.util.module_from_spec(spec); spec.loader.exec_module(g)
shell,led,metric,ISO=g.shell,g.led,g.metric,g.ISO
O={}
def chart(h=170,txt="",c="#101014"):
    return f'''<div class="ground ground-fine" style="height:{h}px;border:1px solid var(--line);position:relative;overflow:hidden">
      <svg viewBox="0 0 600 {h}" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%">
        <rect x="0" y="{h*.34}" width="600" height="{h*.30}" fill="#4E8A3C" opacity=".08"/>
        <line x1="0" y1="{h*.34}" x2="600" y2="{h*.34}" stroke="#4E8A3C" stroke-width="1" stroke-dasharray="4 4"/>
        <line x1="0" y1="{h*.64}" x2="600" y2="{h*.64}" stroke="#4E8A3C" stroke-width="1" stroke-dasharray="4 4"/>
        <polyline fill="none" stroke="{c}" stroke-width="1.6"
          points="0,{h*.52} 75,{h*.55} 150,{h*.60} 225,{h*.63} 300,{h*.68} 375,{h*.71} 450,{h*.70} 525,{h*.73} 600,{h*.75}"/>
      </svg>
      <span class="lbl" style="position:absolute;left:10px;top:8px">{txt}</span>
      <span class="lbl" style="position:absolute;right:10px;top:8px;color:var(--ok)">— TARGET BAND 6.5–7.5</span></div>'''

# ============================== WATER / pH ==============================
O["03_water.html"]=shell("Water","HOME &gt; WATER TREATMENT",
 '''<div style="display:flex;justify-content:space-between;align-items:flex-end">
      <div><div class="lbl">MAIN TANK · 200 L · PH-4502C PROBE VIA ADS1115 CH0</div>
           <div class="display d-xl" style="margin-top:8px">WATER TREATMENT</div></div>
      <div style="display:flex;gap:8px"><span class="tag tag-warn">UNCALIBRATED</span>
        <button class="btn btn-ghost btn-sm">Run calibration</button></div></div>''',
 f'''<div class="grid g4">
   {g.metric("CURRENT pH","6.4","pH","<span style='color:var(--warn)'>BELOW 6.5 ADVISORY FLOOR</span>")}
   {g.metric("24 H RANGE","6.3–6.9","","STABLE · NO STEP CHANGE")}
   {g.metric("READINGS STORED","1,412","","LAST 7 DAYS · 99.1% OF EXPECTED")}
   {g.metric("DOSING EVENTS","0","","<span class='tag tag-wip'>MODULE PLANNED</span>")}
 </div>
 <div class="grid g32" style="margin-top:14px">
   <div class="panel"><div class="panel-head"><span class="lbl lbl-ink">TANK pH — 24 HOUR</span><span class="lbl">SAMPLED 60 s</span></div>
     <div class="panel-pad">{chart(180,"pH · TANK")}</div></div>
   <div class="panel"><div class="panel-head"><span class="lbl lbl-ink">CALIBRATION</span></div>
     <table class="tbl">
       <tr><th>POINT</th><th class="r">BUFFER</th><th class="r">MEASURED</th><th>STATE</th></tr>
       <tr><td>P1</td><td class="r">pH 7.00</td><td class="r">2.766 V</td><td><span class="tag tag-warn">TRIM ONLY</span></td></tr>
       <tr><td>P2</td><td class="r">pH 4.00</td><td class="r">—</td><td><span class="tag tag-alert">NOT DONE</span></td></tr>
     </table>
     <div class="panel-pad"><div class="mono-sm" style="color:var(--ink-muted)">
       Until both points are recorded every reading is published with quality
       <b>uncalibrated</b> and is stored as evidence, never as a settled measurement.</div></div></div>
 </div>
 <div class="panel" style="margin-top:14px"><div class="panel-head"><span class="lbl lbl-ink">TREATMENT POLICY</span></div>
  <table class="tbl">
    <tr><th style="width:34px">#</th><th>CONDITION</th><th>ACTION</th><th style="width:150px">STATUS</th></tr>
    <tr><td>01</td><td>pH within 6.5 – 7.5</td><td>No action; irrigation proceeds normally</td><td><span class="tag tag-ok">ACTIVE</span></td></tr>
    <tr><td>02</td><td>pH outside band for &gt; 3 consecutive readings</td><td>Raise advisory alert to the farmer</td><td><span class="tag tag-ok">ACTIVE</span></td></tr>
    <tr><td>03</td><td>pH &lt; 5.5 or &gt; 8.5</td><td>Suspend automatic irrigation until acknowledged</td><td><span class="tag tag-ok">ACTIVE</span></td></tr>
    <tr><td>04</td><td>Corrective dosing via relay CH03</td><td>Metered dose, bounded volume, logged</td><td><span class="tag tag-wip">UNDER CONSTRUCTION</span></td></tr>
  </table></div>''', nav="WATER")

# ============================== CROP / DISEASE ==============================
O["04_crop.html"]=shell("Crop","HOME &gt; CROP &gt; DISEASE DETECTION",
 '''<div style="display:flex;justify-content:space-between;align-items:flex-end">
      <div><div class="lbl">ZONE-A · LETTUCE · MOBILENETV2 · MODEL mnv2-v0 (NOT TRAINED)</div>
           <div class="display d-xl" style="margin-top:8px">DISEASE DETECTION</div></div>
      <button class="btn btn-pill btn-sm">Upload leaf image</button></div>''',
 f'''<div class="grid g2">
  <div class="panel"><div class="panel-head"><span class="lbl lbl-ink">CAPTURE</span><span class="lbl">MANUAL UPLOAD</span></div>
   <div class="panel-pad">
    <div class="ground ground-fine" style="height:230px;border:1.5px dashed var(--line-strong);display:flex;
         flex-direction:column;align-items:center;justify-content:center;gap:10px">
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#9A9A9E" stroke-width="1.2">
        <rect x="3" y="5" width="18" height="14"/><circle cx="12" cy="12" r="3.5"/><path d="M8 5l1.5-2h5L16 5"/></svg>
      <span class="lbl">DROP A LEAF PHOTO, OR TAP TO BROWSE</span>
      <span class="mono-sm" style="color:var(--ink-faint)">JPEG / PNG · MAX 8 MB · ONE LEAF, FILLING THE FRAME</span></div>
    <div class="mono-sm" style="color:var(--ink-muted);margin-top:12px">
      Automated capture arrives with the survey rover. Until then the farmer photographs a leaf
      with a phone and uploads it here — the classification path is identical either way.</div>
   </div></div>

  <div class="panel"><div class="panel-head"><span class="lbl lbl-ink">RESULT</span><span class="tag tag-wip">AWAITING TRAINED MODEL</span></div>
   <div class="panel-pad">
    <div class="display d-lg">Early blight</div>
    <div class="mono-sm" style="color:var(--ink-muted);margin-top:2px">Alternaria solani</div>
    <div class="lbl" style="margin-top:18px">CONFIDENCE</div>
    <div class="bar bar-warn" style="margin-top:7px"><i style="width:87%"></i>
      <span class="bar-mark" style="left:90%"></span></div>
    <div style="display:flex;justify-content:space-between;margin-top:6px">
      <span class="mono-sm" style="color:var(--warn)"><b>0.87</b></span>
      <span class="mono-sm" style="color:var(--ink-faint)">ALERT GATE 0.90</span></div>
    <table class="tbl" style="margin-top:16px">
      <tr><th>ALTERNATIVE</th><th class="r">P</th></tr>
      <tr><td>Early blight</td><td class="r">0.87</td></tr>
      <tr><td>Late blight</td><td class="r">0.08</td></tr>
      <tr><td>Leaf mould</td><td class="r">0.03</td></tr>
      <tr><td>Healthy</td><td class="r">0.02</td></tr>
    </table>
    <div style="display:flex;gap:8px;margin-top:14px">
      <button class="btn btn-sm">Confirm</button><button class="btn btn-ghost btn-sm">Dismiss</button></div>
    <div class="mono-sm" style="color:var(--ink-muted);margin-top:12px">
      Below the gate the result is shown for confirmation and actuates nothing. The system advises; it never doses.</div>
   </div></div>
 </div>
 <div class="panel" style="margin-top:14px"><div class="panel-head"><span class="lbl lbl-ink">CLASSIFICATION HISTORY</span></div>
  <table class="tbl">
    <tr><th>WHEN</th><th>ZONE</th><th>SOURCE</th><th>CLASS</th><th class="r">CONF.</th><th>MODEL</th><th>OUTCOME</th></tr>
    <tr><td colspan="7" style="text-align:center;color:var(--ink-faint);padding:26px">
      NO CLASSIFICATIONS YET — MODEL TRAINING SCHEDULED 29 SEP – 12 OCT 2026</td></tr>
  </table></div>''', nav="CROP")

# ============================== DEVICES ==============================
O["05_devices.html"]=shell("Devices","HOME &gt; DEVICES",
 '''<div style="display:flex;justify-content:space-between;align-items:flex-end">
      <div><div class="lbl">3 REGISTERED · 2 ONLINE</div>
           <div class="display d-xl" style="margin-top:8px">DEVICE REGISTRY</div></div>
      <button class="btn btn-ghost btn-sm">Provision device</button></div>''',
 f'''<div class="grid g3">
  <div class="panel"><div class="panel-head"><span class="lbl lbl-ink">PI-CORE-01</span>{led("ok","online")}</div>
   <div class="panel-pad"><div class="lbl">RASPBERRY PI · CENTRAL SERVER</div>
    <table class="tbl" style="margin-top:10px">
      <tr><td>Role</td><td class="r">API · DB · broker · AI</td></tr>
      <tr><td>Services</td><td class="r">6 / 6 up</td></tr>
      <tr><td>Uptime</td><td class="r">4 d 02 h</td></tr>
      <tr><td>Firmware</td><td class="r">core-1.0.0</td></tr></table></div></div>

  <div class="panel"><div class="panel-head"><span class="lbl lbl-ink">ESP-FIELD-01</span>{led("ok","online")}</div>
   <div class="panel-pad"><div class="lbl">ESP8266 · FIELD NODE</div>
    <table class="tbl" style="margin-top:10px">
      <tr><td>Soil moisture</td><td class="r">ADS1115 CH1</td></tr>
      <tr><td>Water pH</td><td class="r">ADS1115 CH0</td></tr>
      <tr><td>Rain</td><td class="r">D7 digital</td></tr>
      <tr><td>Relays</td><td class="r">D1 D2 D5 D6</td></tr>
      <tr><td>Last seen</td><td class="r">12 s ago</td></tr></table></div></div>

  <div class="panel"><div class="panel-head"><span class="lbl lbl-ink">ROVER-01</span><span class="tag tag-wip">WIP</span></div>
   <div class="panel-pad"><div class="lbl">SURVEY ROVER · CAMERA</div>
    <div class="ground ground-fine" style="height:96px;border:1.5px dashed var(--line-strong);
      display:flex;align-items:center;justify-content:center;margin-top:10px">
      <span class="lbl">NOT COMMISSIONED</span></div>
    <div class="mono-sm" style="color:var(--ink-muted);margin-top:11px">
      Chassis and camera not yet built. Its MQTT topics and database rows are already defined,
      so it registers without a schema change.</div></div></div>
 </div>

 <div class="panel" style="margin-top:14px"><div class="panel-head">
   <span class="lbl lbl-ink">SENSOR CHANNELS</span><span class="lbl">ESP-FIELD-01</span></div>
  <table class="tbl">
    <tr><th style="width:34px">#</th><th>CHANNEL</th><th>PIN</th><th class="r">LATEST</th><th>QUALITY</th><th>STATE</th></tr>
    <tr><td>01</td><td>Soil moisture · capacitive</td><td>ADS1115 A1</td><td class="r">22.4 %</td><td><span class="tag tag-ok">VALID</span></td><td>{led("alert","below threshold")}</td></tr>
    <tr><td>02</td><td>Water pH · PH-4502C</td><td>ADS1115 A0</td><td class="r">6.4 pH</td><td><span class="tag tag-warn">UNCALIBRATED</span></td><td>{led("warn","advisory")}</td></tr>
    <tr><td>03</td><td>Rain · digital</td><td>D7 · GPIO13</td><td class="r">DRY</td><td><span class="tag tag-ok">VALID</span></td><td>{led("ok","nominal")}</td></tr>
    <tr><td>04</td><td>Supply voltage · solar</td><td>divider</td><td class="r">6.8 V</td><td><span class="tag tag-ok">VALID</span></td><td>{led("ok","charging")}</td></tr>
  </table></div>

 <div class="blueprint reg" style="margin-top:14px">
  <div style="display:grid;grid-template-columns:1.1fr 1fr">
   <div style="padding:20px">{ISO}</div>
   <div style="padding:22px 24px;border-left:1px solid var(--bp-line)">
     <div class="lbl">FIELD TOPOLOGY</div>
     <div class="display d-md" style="color:#fff;margin:10px 0 14px">ONE NODE, FOUR CHANNELS,<br>TWO WATER PATHS.</div>
     <div class="bp-box">
      <div style="display:flex;gap:12px;padding:9px 13px;border-bottom:1px solid var(--bp-line)">
        <span class="idx" style="color:var(--bp-ink-soft)">01</span><span class="mono" style="color:#fff">Gravity feed · 12 V solenoid</span></div>
      <div style="display:flex;gap:12px;padding:9px 13px;border-bottom:1px solid var(--bp-line)">
        <span class="idx" style="color:var(--bp-ink-soft)">02</span><span class="mono" style="color:#fff">Pressured feed · 6 V solar pump</span></div>
      <div style="display:flex;gap:12px;padding:9px 13px">
        <span class="idx" style="color:var(--bp-ink-soft)">03</span><span class="mono" style="color:#fff">Rain lockout overrides both</span></div>
     </div></div></div></div>''', nav="DEVICES")

# ============================== ROVER ==============================
O["06_rover.html"]=shell("Rover","HOME &gt; DEVICES &gt; ROVER-01",
 '''<div style="display:flex;justify-content:space-between;align-items:flex-end">
      <div><div class="lbl">ROVER-01 · SURVEY &amp; TARGETED WATERING</div>
           <div class="display d-xl" style="margin-top:8px">SURVEY ROVER</div></div>
      <span class="tag tag-wip" style="font-size:11px;padding:7px 12px">UNDER CONSTRUCTION</span></div>''',
 f'''<div class="panel reg" style="padding:0">
   <div class="ground" style="padding:46px 40px;display:flex;flex-direction:column;align-items:center;gap:18px">
     <svg width="112" height="112" viewBox="0 0 64 64" fill="none" stroke="var(--ink-faint)" stroke-width="1.3">
       <rect x="10" y="24" width="44" height="20"/><circle cx="20" cy="48" r="6"/><circle cx="44" cy="48" r="6"/>
       <path d="M26 24v-8h12v8M32 16V9"/><circle cx="32" cy="7" r="2.5"/>
       <path d="M14 30h8M14 36h8" stroke-dasharray="2 3"/></svg>
     <div class="display d-lg" style="text-align:center">MODULE NOT YET COMMISSIONED</div>
     <div style="max-width:560px;text-align:center;color:var(--ink-muted)">
       The rover carries the camera that automates crop survey and per-cell watering. Its interfaces are
       specified and reserved — MQTT topics, database relations and API routes all exist — so commissioning
       is a hardware and firmware task, not a redesign.</div>
     <div style="display:flex;gap:8px"><button class="btn btn-ghost btn-sm">View specification</button>
       <button class="btn btn-sm">Open build plan</button></div>
   </div>
 </div>
 <div class="grid g2" style="margin-top:14px">
  <div class="panel"><div class="panel-head"><span class="lbl lbl-ink">RESERVED INTERFACES</span><span class="lbl">ALREADY DEFINED</span></div>
   <table class="tbl">
     <tr><th style="width:34px">#</th><th>INTERFACE</th><th>STATE</th></tr>
     <tr><td>01</td><td>devices/rover-01/mission/set</td><td><span class="tag tag-ok">DEFINED</span></td></tr>
     <tr><td>02</td><td>devices/rover-01/mission/state</td><td><span class="tag tag-ok">DEFINED</span></td></tr>
     <tr><td>03</td><td>survey_mission · crop_image · vision_analysis</td><td><span class="tag tag-ok">MIGRATED</span></td></tr>
     <tr><td>04</td><td>POST /api/v1/missions</td><td><span class="tag tag-ok">IMPLEMENTED</span></td></tr>
   </table></div>
  <div class="panel"><div class="panel-head"><span class="lbl lbl-ink">COMMISSIONING PLAN</span></div>
   <table class="tbl">
     <tr><th style="width:34px">#</th><th>STEP</th><th>WINDOW</th></tr>
     <tr><td>01</td><td>Chassis, motors and camera mount</td><td>13 – 19 Oct</td></tr>
     <tr><td>02</td><td>Port grid vision from personal build</td><td>13 – 19 Oct</td></tr>
     <tr><td>03</td><td>Serial protocol &amp; safety clamps</td><td>20 – 22 Oct</td></tr>
     <tr><td>04</td><td>Field trial on Zone A</td><td>23 – 26 Oct</td></tr>
   </table></div>
 </div>''', nav="DEVICES")

# ============================== REPORTS ==============================
O["07_reports.html"]=shell("Reports","HOME &gt; REPORTS",
 '''<div style="display:flex;justify-content:space-between;align-items:flex-end">
      <div><div class="lbl">01 – 31 OCTOBER 2026 · ALL ZONES</div>
           <div class="display d-xl" style="margin-top:8px">REPORTS</div></div>
      <div style="display:flex;gap:8px"><button class="btn btn-ghost btn-sm">01 Oct – 31 Oct ▾</button>
        <button class="btn btn-ghost btn-sm">CSV</button><button class="btn btn-sm">PDF</button></div></div>''',
 f'''<div class="grid g4">
   {g.metric("WATER USED","412","L","<span style='color:var(--ok)'>▼ 23% vs SEPTEMBER</span>")}
   {g.metric("IRRIGATION EVENTS","96","","81 AUTO · 9 MANUAL · 6 DEFERRED")}
   {g.metric("RAIN DEFERRALS","14","","≈ 47 L NOT APPLIED")}
   {g.metric("TELEMETRY UPTIME","97.4","%","TARGET ≥ 90%")}
 </div>
 <div class="grid g2" style="margin-top:14px">
   <div class="panel"><div class="panel-head"><span class="lbl lbl-ink">WATER BY ZONE</span><span class="lbl">PER WEEK</span></div>
    <div class="panel-pad"><div class="ground ground-fine" style="height:180px;border:1px solid var(--line);position:relative">
      <svg viewBox="0 0 560 180" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%">
       {"".join(f'<rect x="{30+i*70}" y="{180-h}" width="26" height="{h}" fill="#101014"/><rect x="{58+i*70}" y="{180-h2}" width="26" height="{h2}" fill="#1E56A9"/>' for i,(h,h2) in enumerate([(96,72),(112,84),(78,60),(124,92),(88,66)]))}
      </svg></div></div></div>
   <div class="panel"><div class="panel-head"><span class="lbl lbl-ink">ZONE SUMMARY</span></div>
    <table class="tbl">
      <tr><th>ZONE</th><th>CROP</th><th class="r">WATER</th><th class="r">EVENTS</th><th class="r">AVG MOIST.</th><th class="r">ALERTS</th></tr>
      <tr><td>ZONE-A</td><td>Lettuce</td><td class="r">241 L</td><td class="r">57</td><td class="r">34.2%</td><td class="r">9</td></tr>
      <tr><td>ZONE-B</td><td>Cabbage</td><td class="r">171 L</td><td class="r">39</td><td class="r">39.8%</td><td class="r">3</td></tr>
      <tr><td style="color:var(--ink-faint)">ZONE-C</td><td style="color:var(--ink-faint)">—</td><td class="r" colspan="4" style="color:var(--ink-faint)">NOT PLANTED</td></tr>
    </table></div>
 </div>''', nav="REPORTS")

for k,v in O.items(): pathlib.Path(k).write_text(v,encoding="utf-8")
print("wrote",list(O))
