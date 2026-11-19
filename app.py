import glob, json, os, platform, re, subprocess, threading, time
from functools import wraps

import psutil
import connectors
from flask import Flask, jsonify, render_template, send_file, request, session, redirect, url_for, abort
from werkzeug.security import check_password_hash

BASE = os.path.dirname(os.path.abspath(__file__))
conf = json.load(open(os.path.join(BASE, "config.json")))

app = Flask(__name__)
app.secret_key = conf["secret_key"]
app.config.update(SESSION_COOKIE_SAMESITE="Strict", SESSION_COOKIE_HTTPONLY=True,
                  PERMANENT_SESSION_LIFETIME=60 * 60 * 12, MAX_CONTENT_LENGTH=2 * 1024 ** 3)
psutil.cpu_percent(percpu=True)

UNIT_RE = re.compile(r"^[A-Za-z0-9:_.@\\-]+\.(service|timer|socket)$")


# ---------- helpers ----------
def read(path):
    try:
        with open(path) as f:
            return f.read().strip()
    except Exception:
        return None


def sh(cmd, timeout=15):
    try:
        return subprocess.check_output(cmd, text=True, timeout=timeout, stderr=subprocess.STDOUT).strip()
    except subprocess.CalledProcessError as e:
        return (e.output or "").strip()
    except Exception:
        return None


def cpu_temp():
    v = read("/sys/class/thermal/thermal_zone0/temp")
    return round(int(v) / 1000, 1) if v else None


def fan():
    for d in glob.glob("/sys/class/hwmon/hwmon*"):
        rpm = read(d + "/fan1_input")
        if rpm is not None:
            return int(rpm)
    return None


def cpu_freq():
    v = read("/sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq")
    return int(v) // 1000 if v else None


def disks():
    out = []
    for p in psutil.disk_partitions():
        if p.fstype in ("", "squashfs", "tmpfs"):
            continue
        try:
            u = psutil.disk_usage(p.mountpoint)
        except Exception:
            continue
        out.append(dict(mount=p.mountpoint, dev=p.device, fs=p.fstype,
                        total=u.total, used=u.used, percent=u.percent))
    return out


def api(f):
    @wraps(f)
    def w(*a, **k):
        if not session.get("auth"):
            return jsonify(error="auth"), 401
        if request.method == "POST" and request.headers.get("X-Requested-With") != "PiMonitor":
            return jsonify(error="bad request"), 400
        return f(*a, **k)
    return w


# ---------- auth ----------
_fails = {}


@app.route("/login", methods=["GET", "POST"])
def login():
    err = None
    if request.method == "POST":
        ip = request.remote_addr
        n, t = _fails.get(ip, (0, 0))
        if n >= 5 and time.time() - t < 300:
            err = "Too many attempts. Try again in a few minutes."
        elif check_password_hash(conf["password_hash"], request.form.get("password", "")):
            _fails.pop(ip, None)
            session.clear()
            session.permanent = True
            session["auth"] = True
            return redirect(url_for("index"))
        else:
            _fails[ip] = (n + 1, time.time())
            err = "Invalid password."
    return render_template("login.html", err=err)


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


@app.route("/")
def index():
    if not session.get("auth"):
        return redirect(url_for("login"))
    return send_file(os.path.join(BASE, "templates", "index.html"), max_age=0)


# ---------- history sampler (SQLite, 7 day retention) ----------
import sqlite3
DB = os.path.join(BASE, "metrics.db")
RANGES = {"5m": 300, "30m": 1800, "6h": 21600, "24h": 86400, "7d": 604800}
LIVE = {"rx": 0.0, "tx": 0.0}


def db():
    c = sqlite3.connect(DB, timeout=10)
    c.execute("PRAGMA journal_mode=WAL")
    return c


def init_db():
    c = db()
    c.execute("CREATE TABLE IF NOT EXISTS m (t INTEGER PRIMARY KEY, temp REAL, fan REAL, cpu REAL, ram REAL, rx REAL, tx REAL, load REAL, freq REAL)")
    c.commit(); c.close()


def sampler():
    init_db()
    c = db()
    last = psutil.net_io_counters(); lt = time.time(); n = 0
    psutil.cpu_percent()
    while True:
        time.sleep(5)
        now = time.time(); io = psutil.net_io_counters(); dt = max(now - lt, 0.001)
        LIVE["rx"] = (io.bytes_recv - last.bytes_recv) / dt; LIVE["tx"] = (io.bytes_sent - last.bytes_sent) / dt
        last, lt = io, now
        try:
            c.execute("INSERT OR REPLACE INTO m VALUES (?,?,?,?,?,?,?,?,?)", (int(now), cpu_temp(), fan(), psutil.cpu_percent(),
                      psutil.virtual_memory().percent, LIVE["rx"], LIVE["tx"], os.getloadavg()[0], cpu_freq()))
            n += 1
            if n % 6 == 0:
                c.execute("DELETE FROM m WHERE t < ?", (int(now) - 604800 - 60,)) if n % 720 == 0 else None
                c.commit()
        except Exception:
            pass


threading.Thread(target=sampler, daemon=True).start()


@app.route("/api/history")
@api
def history():
    rng = request.args.get("range", "30m")
    span = RANGES.get(rng, 1800)
    step = max(5, span // 240)
    since = int(time.time()) - span
    c = db()
    rows = c.execute("SELECT (t/?)*? AS b, AVG(temp), MAX(temp), AVG(fan), AVG(cpu), MAX(cpu), AVG(ram), AVG(rx), AVG(tx), AVG(load), AVG(freq) FROM m WHERE t >= ? GROUP BY b ORDER BY b",
                     (step, step, since)).fetchall()
    c.close()
    keys = ["t", "temp", "temp_max", "fan", "cpu", "cpu_max", "ram", "rx", "tx", "load", "freq"]
    pts = [dict(zip(keys, [round(v, 2) if isinstance(v, float) else v for v in r])) for r in rows]
    return jsonify(range=rng, span=span, step=step, points=pts)


# ---------- dashboard ----------
@app.route("/api/stats")
@api
def stats():
    now = time.time()
    c = psutil.net_io_counters()
    rx, tx = LIVE["rx"], LIVE["tx"]
    vm, sw = psutil.virtual_memory(), psutil.swap_memory()
    return jsonify(
        hostname=platform.node(),
        model=(read("/proc/device-tree/model") or "").strip("\x00"),
        os=sh(["sh", "-c", ". /etc/os-release; echo $PRETTY_NAME"]),
        kernel=platform.release(), arch=platform.machine(),
        uptime=int(now - psutil.boot_time()), time=time.strftime("%a %d %b %Y %H:%M:%S"),
        load=os.getloadavg(), temp=cpu_temp(), fan=fan(), freq=cpu_freq(),
        throttled=sh(["vcgencmd", "get_throttled"]),
        cpu=psutil.cpu_percent(), cores=psutil.cpu_percent(percpu=True),
        ram=dict(total=vm.total, used=vm.total - vm.available, percent=vm.percent),
        swap=dict(total=sw.total, used=sw.used, percent=sw.percent),
        disks=disks(),
        net=dict(rx=rx, tx=tx, rx_total=c.bytes_recv, tx_total=c.bytes_sent),
        nproc=len(psutil.pids()), tz=(sh(["timedatectl", "show", "-p", "Timezone", "--value"]) or "").strip(),
    )


@app.route("/api/processes")
@api
def processes():
    procs = []
    for p in psutil.process_iter(["pid", "ppid", "name", "username", "cpu_percent", "memory_percent", "status", "cmdline"]):
        i = p.info
        procs.append(dict(pid=i["pid"], ppid=i["ppid"], name=i["name"], user=i["username"],
                          cpu=round(i["cpu_percent"] or 0, 1), mem=round(i["memory_percent"] or 0, 1),
                          status=i["status"], cmd=" ".join(i["cmdline"] or [])[:200]))
    procs.sort(key=lambda x: (x["cpu"], x["mem"]), reverse=True)
    return jsonify(procs=procs, total=len(procs))


@app.route("/api/processes/kill", methods=["POST"])
@api
def kill():
    d = request.get_json(force=True)
    try:
        pid = int(d["pid"])
        if pid == os.getpid() or pid < 2:
            return jsonify(error="refused"), 400
        p = psutil.Process(pid)
        p.kill() if d.get("signal") == "KILL" else p.terminate()
        return jsonify(ok=True)
    except Exception as e:
        return jsonify(error=str(e)), 400


# ---------- storage / network / users ----------
@app.route("/api/storage")
@api
def storage():
    try:
        devs = json.loads(sh(["lsblk", "-J", "-b", "-o", "NAME,SIZE,TYPE,FSTYPE,MOUNTPOINT,MODEL,TRAN,LABEL"]))["blockdevices"]
    except Exception:
        devs = []
    io = {k: v._asdict() for k, v in psutil.disk_io_counters(perdisk=True).items()}
    return jsonify(devices=devs, fs=disks(), io=io)


@app.route("/api/network")
@api
def network():
    stats_ = psutil.net_if_stats()
    io = psutil.net_io_counters(pernic=True)
    out = []
    for name, addrs in psutil.net_if_addrs().items():
        st = stats_.get(name)
        out.append(dict(
            name=name, up=bool(st and st.isup), speed=st.speed if st else 0, mtu=st.mtu if st else 0,
            mac=next((a.address for a in addrs if a.family == psutil.AF_LINK), None),
            ipv4=[a.address for a in addrs if a.family.name == "AF_INET"],
            ipv6=[a.address.split("%")[0] for a in addrs if a.family.name == "AF_INET6"],
            rx=io[name].bytes_recv if name in io else 0, tx=io[name].bytes_sent if name in io else 0))
    return jsonify(ifaces=out, dns=sh(["sh", "-c", "grep ^nameserver /etc/resolv.conf | awk '{print $2}'"]),
                   gw=sh(["sh", "-c", "ip route | awk '/default/{print $3\" via \"$5}'"]))


@app.route("/api/users")
@api
def users():
    allu = []
    for line in open("/etc/passwd"):
        f = line.strip().split(":")
        uid = int(f[2])
        if uid == 0 or 1000 <= uid < 65534:
            allu.append(dict(name=f[0], uid=uid, gid=int(f[3]), home=f[5], shell=f[6]))
    now = [dict(name=u.name, terminal=u.terminal, host=u.host,
                started=time.strftime("%Y-%m-%d %H:%M", time.localtime(u.started))) for u in psutil.users()]
    return jsonify(users=allu, sessions=now)


# ---------- updates ----------
upd = {"running": False, "action": None, "log": "", "rc": None, "finished": None, "started": None, "total": 0}
upd_lock = threading.Lock()
LOG_CAP = 400_000
APT_ENV = dict(os.environ, DEBIAN_FRONTEND="noninteractive", LC_ALL="C")
_pk_cache = {"key": None, "pk": []}


def _pkgs():
    """Upgradable packages, cached until the dpkg status or the apt lists change."""
    try:
        key = (os.path.getmtime("/var/lib/dpkg/status"), os.path.getmtime("/var/lib/apt/lists"))
    except OSError:
        key = None
    if key is not None and key == _pk_cache["key"]:
        return _pk_cache["pk"]
    out = sh(["apt", "list", "--upgradable"], 30) or ""
    pk = []
    for l in out.splitlines():
        m = re.match(r"^(\S+?)/(\S+) (\S+) (\S+) \[upgradable from: (\S+)\]", l)
        if m:
            pk.append(dict(name=m[1], repo=m[2], new=m[3], arch=m[4], old=m[5]))
    _pk_cache.update(key=key, pk=pk)
    return pk


def run_apt(action):
    cmds = {"refresh": [["sudo", "-n", "apt-get", "update"]],
            "upgrade": [["sudo", "-n", "apt-get", "update"],
                        ["sudo", "-n", "apt-get", "-y", "-o", "Dpkg::Options::=--force-confold", "upgrade"]]}[action]
    rc = 0
    for c in cmds:
        with upd_lock:
            upd["log"] += "$ " + " ".join(c) + "\n"
        try:
            p = subprocess.Popen(c, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, env=APT_ENV)
            for line in p.stdout:
                with upd_lock:
                    upd["log"] += line
                    if len(upd["log"]) > LOG_CAP:
                        upd["log"] = upd["log"][-LOG_CAP:]
            rc = p.wait()
        except OSError as e:
            with upd_lock:
                upd["log"] += "Could not start: %s\n" % e
            rc = 127
        if rc:
            break
    with upd_lock:
        upd.update(running=False, rc=rc, finished=time.strftime("%H:%M:%S"))


def _last_refresh():
    try:
        last = max(os.path.getmtime(p) for p in glob.glob("/var/lib/apt/lists/*Packages*"))
        return time.strftime("%Y-%m-%d %H:%M", time.localtime(last))
    except ValueError:
        return None


@app.route("/api/updates")
@api
def updates_list():
    pk = _pkgs()
    return jsonify(packages=pk, last_refresh=_last_refresh(), reboot_required=os.path.exists("/var/run/reboot-required"))


@app.route("/api/updates/status")
@api
def updates_status():
    """Cheap job poll. The log is returned incrementally from the byte offset 'since'."""
    try:
        since = max(0, int(request.args.get("since", 0)))
    except ValueError:
        since = 0
    with upd_lock:
        st = dict(upd)
    log = st.pop("log")
    if since > len(log):
        since = 0
    return jsonify(job=st, log=log[since:], offset=len(log), last_refresh=_last_refresh(),
                   reboot_required=os.path.exists("/var/run/reboot-required"))


@app.route("/api/updates/run", methods=["POST"])
@api
def updates_run():
    action = (request.get_json(force=True) or {}).get("action")
    if action not in ("refresh", "upgrade"):
        return jsonify(error="bad action"), 400
    total = len(_pkgs()) if action == "upgrade" else 0
    with upd_lock:
        if upd["running"]:
            return jsonify(error="a job is already running"), 409
        upd.update(running=True, action=action, log="", rc=None, finished=None, started=time.time(), total=total)
    threading.Thread(target=run_apt, args=(action,), daemon=True).start()
    return jsonify(ok=True, total=total)


# ---------- services ----------
@app.route("/api/services")
@api
def services():
    out = sh(["systemctl", "list-units", "--type=service", "--all", "--no-legend", "--plain", "--no-pager"], 20) or ""
    files = sh(["systemctl", "list-unit-files", "--type=service", "--no-legend", "--plain", "--no-pager"], 20) or ""
    enabled = {l.split()[0]: l.split()[1] for l in files.splitlines() if len(l.split()) > 1}
    res = []
    for l in out.splitlines():
        f = l.split(None, 4)
        if len(f) < 4:
            continue
        res.append(dict(unit=f[0], load=f[1], active=f[2], sub=f[3],
                        desc=f[4] if len(f) > 4 else "", enabled=enabled.get(f[0], "")))
    return jsonify(services=res)


@app.route("/api/services/action", methods=["POST"])
@api
def service_action():
    d = request.get_json(force=True)
    unit, act = d.get("unit", ""), d.get("action")
    if not UNIT_RE.match(unit) or act not in ("start", "stop", "restart", "enable", "disable"):
        return jsonify(error="invalid"), 400
    if unit.startswith("pi-monitor") and act in ("stop", "disable"):
        return jsonify(error="refusing to stop the monitor itself"), 400
    return jsonify(ok=True, output=sh(["sudo", "-n", "systemctl", act, unit], 30))


# ---------- logs ----------
@app.route("/api/logs")
@api
def logs():
    n = min(max(int(request.args.get("n", 200)), 10), 2000)
    cmd = ["journalctl", "--no-pager", "-o", "short-iso", "-n", str(n)]
    unit = request.args.get("unit", "")
    if unit:
        if not UNIT_RE.match(unit):
            return jsonify(error="invalid unit"), 400
        cmd += ["-u", unit]
    pr = request.args.get("priority", "")
    if pr in list("01234567"):
        cmd += ["-p", pr]
    if request.args.get("boot") == "1":
        cmd += ["-b"]
    return jsonify(log=sh(cmd, 20) or "")


# ---------- power ----------
@app.route("/api/power", methods=["POST"])
@api
def power():
    act = (request.get_json(force=True) or {}).get("action")
    if act not in ("reboot", "poweroff"):
        return jsonify(error="invalid"), 400
    subprocess.Popen(["sh", "-c", f"sleep 2; sudo -n systemctl {act}"])
    return jsonify(ok=True)


# ---------- file browser (runs as the service user, so OS permissions apply) ----------
import mimetypes, pwd, grp, shutil, stat as stmod
IMG = {"image/png", "image/jpeg", "image/gif", "image/webp"}
HOME = os.path.expanduser("~")


def fpath(raw):
    p = (raw or "").strip() or HOME
    if not p.startswith("/") or "\x00" in p:
        abort(400)
    return os.path.normpath(p)


def protected(p):
    """Paths that must never be deleted or renamed."""
    p = os.path.normpath(p)
    if p == "/" or p.count("/") <= 1 or p == HOME or os.path.dirname(p) == "/home":
        return True
    b = os.path.realpath(BASE); rp = os.path.realpath(p)
    return rp == b or b.startswith(rp + "/") or rp.startswith(b + "/venv") or rp.startswith(b + "/config.json")


def secret(p):
    return os.path.realpath(p) == os.path.join(os.path.realpath(BASE), "config.json")


def modestr(m):
    return stmod.filemode(m)


def ent(dirp, name):
    fp = os.path.join(dirp, name)
    try:
        st = os.lstat(fp)
    except OSError:
        return None
    t = "link" if stmod.S_ISLNK(st.st_mode) else "dir" if stmod.S_ISDIR(st.st_mode) else "file" if stmod.S_ISREG(st.st_mode) else "other"
    tgt = None; isdir = t == "dir"
    if t == "link":
        try:
            tgt = os.readlink(fp); isdir = os.path.isdir(fp)
        except OSError:
            pass
    try:
        owner = pwd.getpwuid(st.st_uid).pw_name
    except KeyError:
        owner = str(st.st_uid)
    try:
        group = grp.getgrgid(st.st_gid).gr_name
    except KeyError:
        group = str(st.st_gid)
    return dict(name=name, type=t, isdir=isdir, size=st.st_size, mtime=int(st.st_mtime), mode=modestr(st.st_mode), owner=owner, group=group, target=tgt)


@app.route("/api/fs/list")
@api
def fs_list():
    p = fpath(request.args.get("path"))
    if not os.path.isdir(p):
        return jsonify(error="Not a directory"), 404
    try:
        names = os.listdir(p)
    except PermissionError:
        return jsonify(error="Permission denied"), 403
    items = [e for e in (ent(p, n) for n in names) if e]
    try:
        du = shutil.disk_usage(p); disk = dict(total=du.total, free=du.free)
    except OSError:
        disk = None
    return jsonify(path=p, parent=os.path.dirname(p) if p != "/" else None, home=HOME, entries=items, disk=disk)


@app.route("/api/fs/read")
@api
def fs_read():
    p = fpath(request.args.get("path"))
    if not os.path.isfile(p):
        return jsonify(error="Not a file"), 404
    if secret(p):
        return jsonify(error="This file holds the console credentials and cannot be shown"), 403
    size = os.path.getsize(p); lim = 512 * 1024
    try:
        with open(p, "rb") as f:
            data = f.read(lim)
    except OSError as e:
        return jsonify(error=e.strerror or "Cannot read"), 403
    if b"\x00" in data[:8192]:
        return jsonify(binary=True, size=size, mime=mimetypes.guess_type(p)[0])
    return jsonify(text=data.decode("utf-8", "replace"), size=size, truncated=size > lim)


@app.route("/api/fs/download")
@api
def fs_download():
    p = fpath(request.args.get("path"))
    if not os.path.isfile(p) or secret(p):
        abort(404)
    inline = request.args.get("inline") == "1" and (mimetypes.guess_type(p)[0] in IMG)
    r = send_file(p, as_attachment=not inline, download_name=os.path.basename(p), conditional=True)
    r.headers["X-Content-Type-Options"] = "nosniff"
    r.headers["Content-Security-Policy"] = "sandbox; default-src 'none'; img-src 'self'"
    return r


def bad_name(n):
    return (not n) or n in (".", "..") or "/" in n or "\x00" in n or len(n.encode()) > 255


@app.route("/api/fs/mkdir", methods=["POST"])
@api
def fs_mkdir():
    d = request.get_json(silent=True) or {}
    p = fpath(d.get("path")); n = (d.get("name") or "").strip()
    if bad_name(n):
        return jsonify(ok=False, error="Invalid name")
    try:
        os.mkdir(os.path.join(p, n))
    except OSError as e:
        return jsonify(ok=False, error=e.strerror)
    return jsonify(ok=True)


@app.route("/api/fs/rename", methods=["POST"])
@api
def fs_rename():
    d = request.get_json(silent=True) or {}
    p = fpath(d.get("path")); n = (d.get("name") or "").strip()
    if bad_name(n):
        return jsonify(ok=False, error="Invalid name")
    if protected(p):
        return jsonify(ok=False, error="This path is protected")
    dst = os.path.join(os.path.dirname(p), n)
    if os.path.lexists(dst):
        return jsonify(ok=False, error="A file with that name already exists")
    try:
        os.rename(p, dst)
    except OSError as e:
        return jsonify(ok=False, error=e.strerror)
    return jsonify(ok=True)


TRASH = os.path.join(HOME, ".pi-monitor-trash")
TRASH_DAYS = 7


def purge_trash():
    if not os.path.isdir(TRASH):
        return
    cut = time.time() - TRASH_DAYS * 86400
    for d in os.listdir(TRASH):
        full = os.path.join(TRASH, d)
        try:
            if os.path.getmtime(full) < cut:
                shutil.rmtree(full, ignore_errors=True)
        except OSError:
            pass


@app.route("/api/fs/delete", methods=["POST"])
@api
def fs_delete():
    d = request.get_json(silent=True) or {}
    p = fpath(d.get("path"))
    if protected(p):
        return jsonify(ok=False, error="This path is protected and cannot be deleted")
    try:
        in_trash = os.path.realpath(p).startswith(os.path.realpath(TRASH) + "/")
        if in_trash or d.get("permanent"):
            if os.path.islink(p) or not os.path.isdir(p):
                os.unlink(p)
            else:
                shutil.rmtree(p)
            return jsonify(ok=True, trashed=False)
        os.makedirs(TRASH, mode=0o700, exist_ok=True)
        purge_trash()
        tid = "%d-%s" % (int(time.time() * 1000), os.urandom(3).hex())
        box = os.path.join(TRASH, tid)
        os.mkdir(box)
        shutil.move(p, os.path.join(box, "item"))
        with open(os.path.join(box, "meta.json"), "w") as f:
            json.dump(dict(orig=p, name=os.path.basename(p)), f)
        os.utime(box)
    except OSError as e:
        return jsonify(ok=False, error=e.strerror)
    return jsonify(ok=True, trashed=True, undo=tid)


@app.route("/api/fs/restore", methods=["POST"])
@api
def fs_restore():
    d = request.get_json(silent=True) or {}
    tid = str(d.get("id") or "")
    if not re.fullmatch(r"\d+-[0-9a-f]{6}", tid):
        return jsonify(ok=False, error="Invalid item")
    box = os.path.join(TRASH, tid)
    try:
        meta = json.load(open(os.path.join(box, "meta.json")))
    except (OSError, ValueError):
        return jsonify(ok=False, error="Item is no longer in the trash")
    dst = meta["orig"]
    if os.path.lexists(dst):
        return jsonify(ok=False, error="Something with that name now exists at the original location")
    try:
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.move(os.path.join(box, "item"), dst)
        shutil.rmtree(box, ignore_errors=True)
    except OSError as e:
        return jsonify(ok=False, error=e.strerror)
    return jsonify(ok=True, path=dst)


@app.route("/api/fs/places")
@api
def fs_places():
    out = [dict(name="Home", path=HOME, kind="home"), dict(name="Root", path="/", kind="root")]
    for n, p in (("Logs", "/var/log"), ("Config", "/etc"), ("Temp", "/tmp"), ("Optional software", "/opt"), ("Server data", "/srv")):
        if os.path.isdir(p):
            out.append(dict(name=n, path=p, kind="dir"))
    for part in psutil.disk_partitions():
        mp = part.mountpoint
        if mp == "/" or mp.startswith(("/boot", "/snap")):
            continue
        try:
            u = psutil.disk_usage(mp)
        except OSError:
            continue
        out.append(dict(name=os.path.basename(mp) or mp, path=mp, kind="disk", total=u.total, used=u.used))
    return jsonify(places=out)


def unique_target(dst):
    if not os.path.lexists(dst):
        return dst
    base, ext = os.path.splitext(dst) if not os.path.isdir(dst) else (dst, "")
    n = 1
    while True:
        cand = f"{base} copy{'' if n == 1 else ' ' + str(n)}{ext}"
        if not os.path.lexists(cand):
            return cand
        n += 1


@app.route("/api/fs/paste", methods=["POST"])
@api
def fs_paste():
    d = request.get_json(silent=True) or {}
    op = d.get("op"); items = d.get("items") or []; dest = fpath(d.get("dest"))
    if op not in ("copy", "move") or not isinstance(items, list) or len(items) > 500 or not os.path.isdir(dest):
        return jsonify(ok=False, error="Invalid request")
    done = 0; errors = []
    for raw in items:
        src = fpath(raw if isinstance(raw, str) else "")
        name = os.path.basename(src)
        if not os.path.lexists(src):
            errors.append(f"{name}: not found"); continue
        rs, rd = os.path.realpath(src), os.path.realpath(dest)
        if os.path.isdir(src) and not os.path.islink(src) and (rd == rs or rd.startswith(rs + "/")):
            errors.append(f"{name}: cannot place a folder inside itself"); continue
        target = os.path.join(dest, name)
        try:
            if op == "move":
                if os.path.dirname(src) == dest:
                    continue
                if protected(src):
                    errors.append(f"{name}: protected"); continue
                if os.path.lexists(target):
                    errors.append(f"{name}: already exists in the destination"); continue
                shutil.move(src, target)
            else:
                target = unique_target(target)
                if os.path.islink(src):
                    os.symlink(os.readlink(src), target)
                elif os.path.isdir(src):
                    shutil.copytree(src, target, symlinks=True)
                else:
                    shutil.copy2(src, target)
            done += 1
        except (OSError, shutil.Error) as e:
            errors.append(f"{name}: {getattr(e, 'strerror', None) or e}")
    return jsonify(ok=not errors, done=done, errors=errors[:5])


@app.route("/api/fs/upload", methods=["POST"])
@api
def fs_upload():
    p = fpath(request.form.get("path"))
    if not os.path.isdir(p):
        return jsonify(ok=False, error="Destination is not a folder")
    overwrite = request.form.get("overwrite") == "1"; saved = []; skipped = []
    for f in request.files.getlist("files"):
        n = os.path.basename((f.filename or "").replace("\\", "/"))
        if bad_name(n):
            continue
        dst = os.path.join(p, n)
        if os.path.lexists(dst) and not overwrite:
            skipped.append(n); continue
        tmp = dst + ".part"
        try:
            f.save(tmp); os.replace(tmp, dst); saved.append(n)
        except OSError as e:
            try: os.unlink(tmp)
            except OSError: pass
            return jsonify(ok=False, error=e.strerror, saved=saved)
    return jsonify(ok=True, saved=saved, skipped=skipped)



# ---------- remote desktop (wayvnc on 127.0.0.1:5900, proxied over an authenticated WebSocket) ----------
import socket
from urllib.parse import urlparse
from flask_sock import Sock
sock = Sock(app)


@app.route("/api/desktop/status")
@api
def desktop_status():
    try:
        socket.create_connection(("127.0.0.1", 5900), timeout=1).close()
        return jsonify(up=True)
    except OSError:
        return jsonify(up=False)


@sock.route("/ws/desktop")
def desktop_ws(ws):
    if not session.get("auth"):
        return
    origin = request.headers.get("Origin", "")
    if origin and urlparse(origin).netloc != request.host:
        return
    try:
        up = socket.create_connection(("127.0.0.1", 5900), timeout=3)
    except OSError:
        return
    up.settimeout(None)
    done = threading.Event()

    def pump():
        try:
            while not done.is_set():
                d = up.recv(65536)
                if not d:
                    break
                ws.send(d)
        except Exception:
            pass
        done.set()
        try:
            ws.close()
        except Exception:
            pass

    threading.Thread(target=pump, daemon=True).start()
    try:
        while not done.is_set():
            d = ws.receive()
            if d is None:
                break
            up.sendall(d if isinstance(d, bytes) else d.encode())
    except Exception:
        pass
    done.set()
    try:
        up.close()
    except Exception:
        pass


# ---------- installable app (public: no secrets) ----------
@app.route("/manifest.webmanifest")
def manifest():
    return jsonify(
        name="Pi Monitor", short_name="Pi Monitor", start_url="/", scope="/", display="standalone",
        background_color="#1c1f24", theme_color="#1c1f24", description="System monitor and admin console for a Raspberry Pi.",
        icons=[dict(src="/static/icons/icon-192.png", sizes="192x192", type="image/png"),
               dict(src="/static/icons/icon-512.png", sizes="512x512", type="image/png"),
               dict(src="/static/icons/maskable-512.png", sizes="512x512", type="image/png", purpose="maskable")]
    ), 200, {"Content-Type": "application/manifest+json"}


@app.route("/sw.js")
def service_worker():
    r = send_file(os.path.join(BASE, "static", "sw.js"), mimetype="text/javascript", max_age=0)
    r.headers["Service-Worker-Allowed"] = "/"
    r.headers["Cache-Control"] = "no-cache"
    return r


@app.route("/favicon.ico")
def favicon():
    return send_file(os.path.join(BASE, "static", "favicon.svg"), mimetype="image/svg+xml", max_age=86400)


# ---------- machines (mesh discovery) ----------
@app.route("/api/machines")
@api
def machines_list():
    ms, errs = connectors.machines(force=request.args.get("force") == "1")
    return jsonify(machines=[m.public() for m in ms], errors=errs)


@app.route("/api/machines/probe", methods=["POST"])
@api
def machines_probe():
    m = connectors.find((request.get_json(force=True) or {}).get("id"))
    if not m:
        return jsonify(error="unknown machine"), 404
    if not m.owned:
        return jsonify(error="This machine belongs to another account, so it is view only."), 403
    if not m.online:
        return jsonify(error="This machine is offline."), 409
    return jsonify(ports=connectors.probe(m))


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080, threaded=True)
