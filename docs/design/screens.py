import pathlib, importlib.util
spec = importlib.util.spec_from_file_location("gen","gen.py")
g = importlib.util.module_from_spec(spec); spec.loader.exec_module(g)
shell, led, metric, ISO = g.shell, g.led, g.metric, g.ISO
O={}

def chart(h=170, txt="MOISTURE % · 24 H · THRESHOLD 30%"):
    return f'''<div class="ground ground-fine" style="height:{h}px;border:1px solid var(--line);position:relative;overflow:hidden">
      <svg viewBox="0 0 600 {h}" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%">
        <line x1="0" y1="{h*0.52}" x2="600" y2="{h*0.52}" stroke="#D8603E" stroke-width="1" stroke-dasharray="4 4"/>
        <polyline fill="none" stroke="#101014" stroke-width="1.6"
          points="0,{h*.30} 60,{h*.34} 120,{h*.42} 180,{h*.50} 240,{h*.61} 300,{h*.66} 330,{h*.30} 390,{h*.33} 450,{h*.41} 510,{h*.48} 600,{h*.55}"/>
        <rect x="300" y="0" width="30" height="{h}" fill="#1E56A9" opacity=".10"/>
      </svg>
      <span class="lbl" style="position:absolute;left:10px;top:8px">{txt}</span>
      <span class="lbl" style="position:absolute;right:10px;bottom:6px;color:var(--alert)">— THRESHOLD</span>
    </div>'''

# ============================== DASHBOARD ==============================
O["01_dashboard.html"]=shell("Dashboard","HOME &gt; DASHBOARD",
 '''<div style="display:flex;justify-content:space-between;align-items:flex-end">
      <div><div class="lbl">SOK FARM · KAMPONG SPEU · 2 ZONES</div>
           <div class="display d-xl" style="margin-top:8px">FARM OVERVIEW</div></div>
      <div style="display:flex;gap:8px;align-items:center">
        <span class="tag tag-ok">LIVE</span><span class="lbl">UPDATED 4 S AGO</span>
        <button class="btn btn-pill btn-sm" style="margin-left:8px">Request irrigation</button></div>
    </div>''',
 f'''<div class="grid g4">
   {metric("SOIL MOISTURE · ZONE A","22.4","%","<span style='color:var(--alert)'>▼ BELOW 30% THRESHOLD</span>")}
   {metric("SOIL MOISTURE · ZONE B","41.0","%","<span style='color:var(--ok)'>WITHIN OPTIMAL BAND</span>")}
   {metric("WATER pH · TANK","6.4","pH","<span style='color:var(--warn)'>UNCALIBRATED — EVIDENCE ONLY</span>")}
   {metric("WATER USED TODAY","18.6","L","4 IRRIGATION EVENTS")}
 </div>

 <div class="grid g32" style="margin-top:14px">
   <div class="panel">
     <div class="panel-head"><span class="lbl lbl-ink">SOIL MOISTURE — ZONE A</span><span class="lbl">24 HOUR</span></div>
     <div class="panel-pad">{chart()}</div>
   </div>
   <div class="panel">
     <div class="panel-head"><span class="lbl lbl-ink">FIELD STATE</span></div>
     <div class="panel-pad" style="display:flex;flex-direction:column;gap:0">
       <div style="display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--line)">
         <span class="lbl">RAIN SENSOR</span>{led("ok","dry")}</div>
       <div style="display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--line)">
         <span class="lbl">INLET SOLENOID</span>{led("alert","open · 00:42")}</div>
       <div style="display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--line)">
         <span class="lbl">PUMP 6V SOLAR</span>{led("idle","off")}</div>
       <div style="display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--line)">
         <span class="lbl">SOLAR SUPPLY</span>{led("ok","charging")}</div>
       <div style="display:flex;justify-content:space-between;padding:9px 0">
         <span class="lbl">RAIN LOCKOUT</span><span class="tag">INACTIVE</span></div>
     </div>
   </div>
 </div>

 <div class="grid g2" style="margin-top:14px">
  <div class="panel">
   <div class="panel-head"><span class="lbl lbl-ink">ZONES</span><span class="lbl">2 ACTIVE</span></div>
   <table class="tbl">
     <tr><th>ZONE</th><th>CROP</th><th class="r">MOISTURE</th><th>STATE</th></tr>
     <tr><td>ZONE-A</td><td>Lettuce</td><td class="r">22.4%</td><td>{led("alert","irrigating")}</td></tr>
     <tr><td>ZONE-B</td><td>Cabbage</td><td class="r">41.0%</td><td>{led("ok","nominal")}</td></tr>
   </table></div>
  <div class="panel">
   <div class="panel-head"><span class="lbl lbl-ink">DEVICES</span><span class="lbl">3 REGISTERED</span></div>
   <table class="tbl">
     <tr><th>DEVICE</th><th>ROLE</th><th>SEEN</th><th>STATE</th></tr>
     <tr><td>PI-CORE-01</td><td>Server · AI</td><td>now</td><td>{led("ok","online")}</td></tr>
     <tr><td>ESP-FIELD-01</td><td>Sensors · relays</td><td>12 s</td><td>{led("ok","online")}</td></tr>
     <tr><td>ROVER-01</td><td>Survey · camera</td><td>—</td><td><span class="tag tag-wip">UNDER CONSTRUCTION</span></td></tr>
   </table></div>
 </div>

 <div class="panel" style="margin-top:14px">
   <div class="panel-head"><span class="lbl lbl-ink">RECENT EVENTS</span><span class="lbl">LAST 6 HOURS</span></div>
   <table class="tbl">
     <tr><th style="width:70px">TIME</th><th style="width:120px">TYPE</th><th>DETAIL</th><th style="width:130px">REASON</th></tr>
     <tr><td>14:02</td><td><span class="tag tag-alert">IRRIGATION</span></td><td>Zone A fell to 22.4% — inlet solenoid opened, max run 90 s</td><td>auto_threshold</td></tr>
     <tr><td>11:20</td><td><span class="tag tag-info">DEFERRED</span></td><td>Zone B irrigation skipped — rain sensor wet</td><td>rain_lockout</td></tr>
     <tr><td>09:35</td><td><span class="tag tag-warn">FAILSAFE</span></td><td>Zone A valve closed at run-time limit</td><td>local_failsafe</td></tr>
     <tr><td>08:04</td><td><span class="tag">pH</span></td><td>Tank pH 6.4 recorded — outside 6.5–7.5 advisory band</td><td>ph_out_of_band</td></tr>
   </table></div>''', nav="DASHBOARD")

# ============================== IRRIGATION ==============================
O["02_irrigation.html"]=shell("Irrigation","HOME &gt; IRRIGATION &gt; ZONE-A",
 '''<div style="display:flex;justify-content:space-between;align-items:flex-end">
      <div><div class="lbl">ZONE-A · LETTUCE · 12 m² · ESP-FIELD-01</div>
           <div class="display d-xl" style="margin-top:8px">IRRIGATION CONTROL</div></div>
      <button class="btn btn-alert">Stop irrigation</button></div>''',
 f'''<div class="grid g3">
   <div class="panel panel-pad reg">
     <div class="lbl">VALVE STATE — REPORTED BY DEVICE</div>
     <div style="display:flex;align-items:center;gap:18px;margin-top:14px">
       <div style="width:84px;height:84px;border:3px solid var(--alert);display:flex;align-items:center;justify-content:center">
         <span class="display" style="font-size:15px;color:var(--alert)">OPEN</span></div>
       <div class="mono-sm" style="line-height:2">
         REASON &nbsp;<b>auto_threshold</b><br>ELAPSED &nbsp;<b>00:42</b> / 01:30<br>OPENED &nbsp;14:02:11</div>
     </div>
     <div class="bar bar-alert" style="margin-top:16px"><i style="width:47%"></i></div>
     <div class="mono-sm" style="color:var(--ink-muted);margin-top:9px">
       The dashboard shows the relay position the controller reports, never the command that was sent.</div>
   </div>

   <div class="panel">
     <div class="panel-head"><span class="lbl lbl-ink">AUTOMATIC RULE</span><span class="tag tag-ok">ENABLED</span></div>
     <table class="tbl">
       <tr><td>Trigger below</td><td class="r"><b>30.0 %</b></td></tr>
       <tr><td>Stop above</td><td class="r"><b>45.0 %</b></td></tr>
       <tr><td>Max run time</td><td class="r"><b>90 s</b></td></tr>
       <tr><td>Cooldown</td><td class="r"><b>30 min</b></td></tr>
       <tr><td>Rain lockout</td><td class="r"><b>ON</b></td></tr>
       <tr><td>Daylight only (solar)</td><td class="r"><b>06:00–17:00</b></td></tr>
     </table>
     <div class="panel-pad" style="padding-top:12px"><button class="btn btn-ghost btn-sm">Edit rule · admin</button></div>
   </div>

   <div class="panel">
     <div class="panel-head"><span class="lbl lbl-ink">MANUAL OVERRIDE</span></div>
     <div class="panel-pad">
       <div class="mono-sm" style="color:var(--ink-muted);margin-bottom:14px">
         Suspends the automatic rule for a bounded window, then local control resumes by itself.</div>
       <div class="lbl">DURATION</div>
       <div style="border:1px solid var(--line-strong);padding:9px 11px;margin:6px 0 14px" class="mono">60 seconds ▾</div>
       <div style="display:flex;gap:8px"><button class="btn btn-sm">Open valve</button>
         <button class="btn btn-ghost btn-sm">Run pump</button></div>
       <div class="mono-sm" style="color:var(--alert);margin-top:12px">
         The firmware run-time limit always outranks a manual command.</div>
     </div>
   </div>
 </div>

 <div class="grid g32" style="margin-top:14px">
   <div class="panel">
     <div class="panel-head"><span class="lbl lbl-ink">MOISTURE vs IRRIGATION</span><span class="lbl">12 HOUR</span></div>
     <div class="panel-pad">{chart(150)}</div></div>
   <div class="panel">
     <div class="panel-head"><span class="lbl lbl-ink">RELAY CHANNEL MAP</span><span class="lbl">4-CH MODULE</span></div>
     <table class="tbl">
       <tr><th style="width:34px">CH</th><th>ASSIGNMENT</th><th>STATE</th></tr>
       <tr><td>01</td><td>Inlet solenoid · 12 V</td><td>{led("alert","energised")}</td></tr>
       <tr><td>02</td><td>Pump · 6 V solar</td><td>{led("idle","off")}</td></tr>
       <tr><td>03</td><td>pH dosing <span class="tag tag-wip">PLANNED</span></td><td>{led("idle","off")}</td></tr>
       <tr><td>04</td><td>Spare</td><td>{led("idle","off")}</td></tr>
     </table></div>
 </div>

 <div class="panel" style="margin-top:14px">
   <div class="panel-head"><span class="lbl lbl-ink">IRRIGATION LOG</span></div>
   <table class="tbl">
     <tr><th>STARTED</th><th>TRIGGER</th><th class="r">DURATION</th><th class="r">VOLUME</th><th>STOP REASON</th><th>RESULT</th></tr>
     <tr><td>14:02:11</td><td>auto_threshold</td><td class="r">42 s</td><td class="r">1.4 L</td><td>—</td><td><span class="tag tag-info">RUNNING</span></td></tr>
     <tr><td>11:20:04</td><td>auto_threshold</td><td class="r">0 s</td><td class="r">0.0 L</td><td>rain_lockout</td><td><span class="tag">DEFERRED</span></td></tr>
     <tr><td>09:35:52</td><td>auto_threshold</td><td class="r">90 s</td><td class="r">3.0 L</td><td>local_failsafe</td><td><span class="tag tag-warn">FAILSAFE</span></td></tr>
     <tr><td>07:12:33</td><td>manual_override</td><td class="r">25 s</td><td class="r">0.8 L</td><td>manual_stop</td><td><span class="tag tag-ok">COMPLETE</span></td></tr>
   </table></div>''', nav="IRRIGATION")

for k,v in O.items(): pathlib.Path(k).write_text(v,encoding="utf-8")
print("wrote",list(O))
