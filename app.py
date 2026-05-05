from flask import Flask, render_template, request, redirect, url_for, jsonify, session, abort
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import func
from datetime import date, timedelta
import holidays
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime

app = Flask(__name__)
# app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///database.db'
app.config['SQLALCHEMY_DATABASE_URI'] = 'postgresql://project_traced_user:IJx98IB2sDqKIcu7pCGFCGOxJGEHBCui@dpg-d7qel2jrjlhs73cie6a0-a.ohio-postgres.render.com/project_traced'
app.config['SECRET_KEY'] = 'projectTRACEDkey123'  # change this!
db = SQLAlchemy(app)

# ── Admin Model ───────────────────────────────────────────────────────────────
class Admin(db.Model):
    __tablename__ = 'admins'

    id         = db.Column(db.Integer, primary_key=True)
    username   = db.Column(db.String(100), unique=True, nullable=False)
    password   = db.Column(db.String(255), nullable=False)
    role       = db.Column(db.String(20), default='admin')  # 'admin' or 'superadmin'
    created_at = db.Column(db.DateTime, server_default=func.now())

    def to_dict(self):
        return {
            'id':         self.id,
            'username':   self.username,
            'role':       self.role,
            'created_at': self.created_at.isoformat(),
        }
    

# ── Models ────────────────────────────────────────────────────────────────────

class CESRecord(db.Model):
    __tablename__ = 'ces_records'

    id               = db.Column(db.Integer, primary_key=True)
    code             = db.Column(db.String(20), unique=True, nullable=False)
    process          = db.Column(db.String(200), nullable=False)
    school           = db.Column(db.String(200), nullable=False)
    date_received    = db.Column(db.Date, nullable=True)
    status           = db.Column(db.String(100), nullable=False)
    date_completed   = db.Column(db.Date, nullable=True)
    processing_days  = db.Column(db.Integer, nullable=True)
    remarks          = db.Column(db.Text, nullable=True)

    def to_dict(self):
        return {
            'id':              self.id,
            'code':            self.code,
            'process':         self.process,
            'school':          self.school,
            'date_received':   self.date_received.isoformat()  if self.date_received  else '',
            'status':          self.status,
            'date_completed':  self.date_completed.isoformat() if self.date_completed else '',
            'processing_days': self.processing_days,
            'remarks':         self.remarks or '',
        }


class FeedbackRating(db.Model):
    __tablename__ = 'feedback_ratings'

    id           = db.Column(db.Integer, primary_key=True)
    rating       = db.Column(db.Integer, nullable=False)          # 1–5
    submitted_at = db.Column(db.DateTime, server_default=func.now(), nullable=False)

    def to_dict(self):
        return {
            'id':           self.id,
            'rating':       self.rating,
            'submitted_at': self.submitted_at.isoformat(),
        }
    
class EPSRecord(db.Model):
    __tablename__ = 'eps_records'

    id               = db.Column(db.Integer, primary_key=True)
    code             = db.Column(db.String(20), unique=True, nullable=False)
    process          = db.Column(db.String(200), nullable=False)
    school           = db.Column(db.String(200), nullable=False)
    date_received    = db.Column(db.Date, nullable=True)
    status           = db.Column(db.String(100), nullable=False)
    date_completed   = db.Column(db.Date, nullable=True)
    processing_days  = db.Column(db.Integer, nullable=True)
    remarks          = db.Column(db.Text, nullable=True)

    def to_dict(self):
        return {
            'id':              self.id,
            'code':            self.code,
            'process':         self.process,
            'school':          self.school,
            'date_received':   self.date_received.isoformat()  if self.date_received  else '',
            'status':          self.status,
            'date_completed':  self.date_completed.isoformat() if self.date_completed else '',
            'processing_days': self.processing_days,
            'remarks':         self.remarks or '',
        }
    

# ── Changelog Feedback Model ──────────────────────────────────────────────────
# Add this class alongside your other models (Admin, CESRecord, etc.)
 
class ChangelogFeedback(db.Model):
    __tablename__ = 'changelog_feedback'
 
    id          = db.Column(db.Integer, primary_key=True)
    version     = db.Column(db.String(20), nullable=False, index=True)  # e.g. "v1.5"
    text        = db.Column(db.Text, nullable=False)
    checked     = db.Column(db.Boolean, default=False, nullable=False)
    checked_at  = db.Column(db.DateTime, nullable=True)
    created_at  = db.Column(db.DateTime, server_default=func.now(), nullable=False)
 
    def to_dict(self):
        return {
            'id':         self.id,
            'version':    self.version,
            'text':       self.text,
            'checked':    self.checked,
            'checked_at': self.checked_at.isoformat() if self.checked_at else None,
            'created_at': self.created_at.isoformat(),
        }



# ── Helpers ───────────────────────────────────────────────────────────────────
def is_admin():
    return session.get('is_admin', False)

def is_superadmin():
    return session.get('is_admin', False) and session.get('admin_role') == 'superadmin'

def compute_processing_days(start: date, end: date) -> int:
    """Count weekdays between start and end (inclusive) excluding PH holidays."""
    if not start or not end or end < start:
        return 0
    ph_holidays = holidays.Philippines(years=range(start.year, end.year + 1))
    count = 0
    current = start
    while current <= end:
        if current.weekday() < 5 and current not in ph_holidays:
            count += 1
        current += timedelta(days=1)
    return count


def next_ces_code() -> str:
    year = date.today().year
    last = (
        db.session.query(CESRecord)
        .filter(CESRecord.code.like(f'CES{year}__%'))
        .order_by(CESRecord.id.desc())
        .first()
    )
    if last:
        try:
            num = int(last.code.split('__')[-1]) + 1
        except ValueError:
            num = 1
    else:
        num = 1
    return f'CES{year}__{num:02d}'


def get_ces_stats() -> dict:
    """Return record count and average processing days for CES."""
    count = db.session.query(func.count(CESRecord.id)).scalar() or 0
    avg = db.session.query(func.avg(CESRecord.processing_days)).scalar()
    return {
        "record_count": count,
        "avg_processing_days": round(float(avg), 1) if avg is not None else None,
    }


def get_feedback_stats() -> dict:
    """Return overall feedback stats for the dashboard."""
    total  = db.session.query(func.count(FeedbackRating.id)).scalar() or 0
    avg    = db.session.query(func.avg(FeedbackRating.rating)).scalar()

    # Distribution: count per star 1–5
    dist_rows = (
        db.session.query(FeedbackRating.rating, func.count(FeedbackRating.id))
        .group_by(FeedbackRating.rating)
        .all()
    )
    distribution = {i: 0 for i in range(1, 6)}
    for rating, cnt in dist_rows:
        distribution[rating] = cnt

    return {
        "total_responses": total,
        "avg_rating":      round(float(avg), 1) if avg else None,
        "distribution":    distribution,
    }


def next_eps_code() -> str:
    year = date.today().year
    last = (
        db.session.query(EPSRecord)
        .filter(EPSRecord.code.like(f'EPS{year}__%'))
        .order_by(EPSRecord.id.desc())
        .first()
    )
    if last:
        try:
            num = int(last.code.split('__')[-1]) + 1
        except ValueError:
            num = 1
    else:
        num = 1
    return f'EPS{year}__{num:02d}'


def get_eps_stats() -> dict:
    count = db.session.query(func.count(EPSRecord.id)).scalar() or 0
    avg = db.session.query(func.avg(EPSRecord.processing_days)).scalar()
    return {
        "record_count": count,
        "avg_processing_days": round(float(avg), 1) if avg is not None else None,
    }


# ── Navigation ────────────────────────────────────────────────────────────────

# Base section definitions — stats are injected at request time in home()
SECTIONS = [
    {"id": "ces",  "label": "CES",  "full": "Chief Education Supervisor"},
    {"id": "eps",  "label": "EPS",  "full": "Education Program Supervisor"},
    {"id": "smme", "label": "SMME", "full": "School Management Monitoring and Evaluation"},
    {"id": "pr",   "label": "PR",   "full": "Planning and Research"},
    {"id": "hrd",  "label": "HRD",  "full": "Human Resource Development"},
    {"id": "yf",   "label": "YF",   "full": "Youth Formation"},
    {"id": "smn",  "label": "SMN",  "full": "Social Mobilization and Networking"},
    {"id": "shn",  "label": "SHN",  "full": "School Health and Nutrition"},
    {"id": "drrm", "label": "DRRM", "full": "Disaster Risk Reduction Management"},
    {"id": "ef",   "label": "EF",   "full": "Education Facilities"},
]

CHANGELOG = [
    {
        "version": "v1.5",
        "date": "May 5, 2026",
        "color": "blue",
        "title": "EPS module integration, data tools & UX refinements",
        "entries": [
            {"tag": "feat", "text": "Introduced feedback module for collecting user comments, suggestions, and update requests with file upload support and automatic text extraction"},
            {"tag": "feat", "text": "Implemented full EPS page functionality, aligning behavior with CES module"},
            {"tag": "feat", "text": "Added data import capability to CES page"},
            {"tag": "feat", "text": "Extended CSV export functionality to Home Page"},
            {"tag": "feat", "text": "Added password visibility toggle in login form"},
            {"tag": "improve", "text": "Enhanced login error messaging"},
            {"tag": "improve", "text": "Refined dashboard header layout for better visibility of SGOD and SDO Antipolo City"},
            {"tag": "improve", "text": "Increased font size of dashboard statistical values for better readability"},
            {"tag": "fix", "text": "Resolved layout inconsistencies in stats cards and section cards"},
            {"tag": "improve", "text": "Enhanced visibility of 'Quick Feedback' section"},
        ],
    },
    {
        "version": "v1.4",
        "date": "May 4, 2026",
        "color": "gray",
        "title": "Role-based access control & UI improvements",
        "entries": [
            {"tag": "feat", "text": "Default users limited to view-only access"},
            {"tag": "feat", "text": "Implemented admin role with additional controls over the site (add, edit, print records)"},
            {"tag": "feat", "text": "Added changelog section visible to admins for tracking site progress"},
            {"tag": "update", "text": "Renamed 'User Satisfaction Rating' to 'Customer Satisfaction Rating' on Home Page"},
            {"tag": "update", "text": "Enhanced typography and layout for improved visibility of \"Schools Division Office of Antipolo City\" and \"School Governance and Operations Division (SGOD)\""},
            {"tag": "remove", "text": "Removed 'Delete' functionality to prevent accidental data loss"},
        ],
    },
    {
        "version": "v1.3",
        "date": "May 3, 2026",
        "color": "gray",
        "title": "Dashboard optimization & data visibility enhancements",
        "entries": [
            {"tag": "improve", "text": "Reduced size of dashboard statistics cards and section cards for better layout balance"},
            {"tag": "feat", "text": "Added print/download feature with automatic inclusion of print/download date"},
            {"tag": "remove", "text": "Removed icons from section boxes on Home Page"},
            {"tag": "feat", "text": "Displayed average processing time alongside total transactions per section"},
            {"tag": "feat", "text": "Implemented visual alert: processing time turns red when exceeding 3-day limit"},
            {"tag": "validation", "text": "Made 'Date Received' field mandatory in 'Add New Record' form"},
        ],
    },
    {
        "version": "v1.0",
        "date": "May 2, 2026",
        "color": "gray",
        "title": "Initial launch",
        "entries": [
            {"tag": "feat", "text": "Project TRACED launched with CES module"}
        ],
    },
]


# Map each section id to its stats-fetching function.
SECTION_STATS_FN = {
    "ces": get_ces_stats,
    "eps": get_eps_stats,
}


def sections_with_stats() -> list:
    """Return SECTIONS list with record_count and avg_processing_days injected."""
    result = []
    for section in SECTIONS:
        s = dict(section)
        fn = SECTION_STATS_FN.get(s["id"])
        if fn:
            s.update(fn())
        else:
            s["record_count"] = 0
            s["avg_processing_days"] = None
        result.append(s)
    return result


# ── Routes ────────────────────────────────────────────────────────────────────

@app.route("/")
def home():
    feedback_stats = get_feedback_stats()
    return render_template(
        "home.html",
        sections=sections_with_stats(),
        active="home",
        feedback_stats=feedback_stats,
    )

# ── Admin Auth ────────────────────────────────────────────────────────────────

@app.route("/admin/login", methods=["POST"])
def admin_login():
    data     = request.get_json(silent=True) or {}
    username = data.get("username", "").strip()
    password = data.get("password", "")

    admin = Admin.query.filter_by(username=username).first()

    if admin and check_password_hash(admin.password, password):
        session['is_admin']       = True
        session['admin_username'] = username
        session['admin_role']     = admin.role   # ← store role
        return jsonify({"success": True, "username": username, "role": admin.role})

    return jsonify({"success": False, "error": "Invalid username or password."}), 401


@app.route("/admin/logout", methods=["POST"])
def admin_logout():
    session.pop('is_admin', None)
    session.pop('admin_username', None)
    return jsonify({"success": True})


@app.route("/admin/status")
def admin_status():
    return jsonify({
        "is_admin":  is_admin(),
        "username":  session.get('admin_username', None),
        "role":      session.get('admin_role', None),   # ← add this
    })

@app.route("/changelog")
def changelog():
    if not is_admin():
        abort(403)
    return render_template("changelog.html", changelog=CHANGELOG, sections=SECTIONS, active="changelog")

# ── Admin Management Page ─────────────────────────────────────────────────────

@app.route("/admin/manage")
def admin_manage():
    if not is_admin():
        return redirect(url_for("home"))  # block non-admins
    admins = Admin.query.order_by(Admin.created_at).all()
    return render_template("admin_manage.html", admins=admins, sections=SECTIONS)


@app.route("/admin/add", methods=["POST"])
def admin_add():
    if not is_admin():
        return jsonify({"error": "Unauthorized"}), 403

    data     = request.get_json(silent=True) or {}
    username = data.get("username", "").strip()

    if not username:
        return jsonify({"error": "Username is required."}), 400

    if Admin.query.filter_by(username=username).first():
        return jsonify({"error": "Username already exists."}), 409

    new_admin = Admin(
        username = username,
        password = generate_password_hash("SGOD@urservice"),  # ← fixed password
        role     = 'admin',                                    # ← always regular admin
    )
    db.session.add(new_admin)
    db.session.commit()
    return jsonify({"success": True, "admin": new_admin.to_dict()}), 201


@app.route("/admin/remove/<int:admin_id>", methods=["POST"])
def admin_remove(admin_id):
    if not is_admin():
        return jsonify({"error": "Unauthorized"}), 403

    admin = Admin.query.get_or_404(admin_id)

    # Prevent removing yourself
    if admin.username == session.get('admin_username'):
        return jsonify({"error": "You cannot remove yourself."}), 400

    db.session.delete(admin)
    db.session.commit()
    return jsonify({"success": True})

# ── Feedback API ──────────────────────────────────────────────────────────────

@app.route("/api/feedback", methods=["POST"])
def api_submit_feedback():
    data   = request.get_json(silent=True) or {}
    rating = data.get("rating")

    if not isinstance(rating, int) or rating < 1 or rating > 5:
        return jsonify({"error": "Rating must be an integer between 1 and 5."}), 400

    entry = FeedbackRating(rating=rating)
    db.session.add(entry)
    db.session.commit()

    stats = get_feedback_stats()
    return jsonify({"success": True, "stats": stats}), 201


@app.route("/api/feedback/stats")
def api_feedback_stats():
    return jsonify(get_feedback_stats())


@app.route("/api/feedback/<int:entry_id>", methods=["DELETE"])
def api_delete_feedback(entry_id):
    entry = FeedbackRating.query.get_or_404(entry_id)
    db.session.delete(entry)
    db.session.commit()
    return jsonify({"success": True, "deleted_id": entry_id})


@app.route("/feedback-log")
def feedback_log():
    entries = FeedbackRating.query.order_by(FeedbackRating.submitted_at.desc()).all()
    stats   = get_feedback_stats()
    return render_template("feedback_log.html", entries=entries, stats=stats,
                           active="feedback_log", timedelta=timedelta)


# ── CES ──────────────────────────────────────────────────────────────────────

@app.route("/ces")
def ces():
    records = CESRecord.query.order_by(CESRecord.id).all()
    return render_template("ces.html", sections=SECTIONS, active="ces", records=records)


@app.route("/ces/add", methods=["GET", "POST"])
def ces_add():
    if not is_admin():
        abort(403)
    if request.method == "POST":
        dr = request.form.get("date_received")
        dc = request.form.get("date_completed")
        date_received   = date.fromisoformat(dr) if dr else None
        date_completed  = date.fromisoformat(dc) if dc else None
        processing_days = compute_processing_days(date_received, date_completed) if date_received and date_completed else None

        record = CESRecord(
            code            = next_ces_code(),
            process         = request.form["process"],
            school          = request.form["school"],
            date_received   = date_received,
            status          = request.form["status"],
            date_completed  = date_completed,
            processing_days = processing_days,
            remarks         = request.form.get("remarks", ""),
        )
        db.session.add(record)
        db.session.commit()
        return redirect(url_for("ces"))

    new_code = next_ces_code()
    return render_template("ces_form.html", sections=SECTIONS, active="ces",
                           mode="add", record=None, new_code=new_code)


@app.route("/ces/edit/<int:record_id>", methods=["GET", "POST"])
def ces_edit(record_id):
    if not is_admin():
        abort(403)

    record = CESRecord.query.get_or_404(record_id)

    if request.method == "POST":
        dr = request.form.get("date_received")
        dc = request.form.get("date_completed")
        date_received   = date.fromisoformat(dr) if dr else None
        date_completed  = date.fromisoformat(dc) if dc else None
        processing_days = compute_processing_days(date_received, date_completed) if date_received and date_completed else None

        record.process         = request.form["process"]
        record.school          = request.form["school"]
        record.date_received   = date_received
        record.status          = request.form["status"]
        record.date_completed  = date_completed
        record.processing_days = processing_days
        record.remarks         = request.form.get("remarks", "")
        db.session.commit()
        return redirect(url_for("ces"))

    return render_template("ces_form.html", sections=SECTIONS, active="ces",
                           mode="edit", record=record, new_code=record.code)


@app.route("/ces/delete/<int:record_id>", methods=["POST"])
def ces_delete(record_id):
    if not is_superadmin():
        abort(403)
    record = CESRecord.query.get_or_404(record_id)
    db.session.delete(record)
    db.session.commit()
    return redirect(url_for("ces"))


@app.route("/ces/import", methods=["POST"])
def ces_import():
    if not session.get("is_admin"):
        return jsonify({"success": False, "error": "Unauthorized"}), 403

    data = request.get_json()
    records = data.get("records", [])
    if not records:
        return jsonify({"success": False, "error": "No records provided."})

    try:
        def parse_date(val):
            if not val or str(val).strip() in ("", "—", "None"):
                return None
            for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%b %d, %Y", "%B %d, %Y"):
                try:
                    return datetime.strptime(str(val).strip(), fmt).date()
                except ValueError:
                    continue
            print(f"Warning: could not parse date '{val}'")
            return None

        # Find the highest existing code number to continue from
        last = db.session.query(CESRecord).order_by(CESRecord.id.desc()).first()
        # Extract the numeric suffix from the last code, e.g. "CES2026__47" → 47
        if last and last.code:
            try:
                counter = int(last.code.split("__")[-1])
            except ValueError:
                counter = 0
        else:
            counter = 0

        for r in records:
            counter += 1
            year = datetime.now().year
            new_code = f"CES{year}__{counter:02d}"

            proc_days = None
            if r.get("processing_days", "").strip() not in ("", "—"):
                try:
                    proc_days = int(float(r["processing_days"]))
                except ValueError:
                    pass

            new_record = CESRecord(
                code=new_code,
                process=r.get("process", ""),
                school=r.get("school", ""),
                date_received=parse_date(r.get("date_received")),
                status=r.get("status", ""),
                date_completed=parse_date(r.get("date_completed")),
                processing_days=proc_days,
                remarks=r.get("remarks", ""),
            )
            db.session.add(new_record)

        db.session.commit()
        return jsonify({"success": True})

    except Exception as ex:
        db.session.rollback()
        return jsonify({"success": False, "error": str(ex)})


# ── API: compute processing days on-the-fly ───────────────────────────────────

@app.route("/api/processing-days")
def api_processing_days():
    dr = request.args.get("date_received")
    dc = request.args.get("date_completed")
    if not dr or not dc:
        return jsonify({"days": None})
    try:
        days = compute_processing_days(date.fromisoformat(dr), date.fromisoformat(dc))
        return jsonify({"days": days})
    except Exception:
        return jsonify({"days": None})


@app.route("/eps")
def eps():
    records = EPSRecord.query.order_by(EPSRecord.id).all()
    return render_template("eps.html", sections=SECTIONS, active="eps", records=records)


@app.route("/eps/add", methods=["GET", "POST"])
def eps_add():
    if not is_admin():
        abort(403)
    if request.method == "POST":
        dr = request.form.get("date_received")
        dc = request.form.get("date_completed")
        date_received   = date.fromisoformat(dr) if dr else None
        date_completed  = date.fromisoformat(dc) if dc else None
        processing_days = compute_processing_days(date_received, date_completed) if date_received and date_completed else None

        record = EPSRecord(
            code            = next_eps_code(),
            process         = request.form["process"],
            school          = request.form["school"],
            date_received   = date_received,
            status          = request.form["status"],
            date_completed  = date_completed,
            processing_days = processing_days,
            remarks         = request.form.get("remarks", ""),
        )
        db.session.add(record)
        db.session.commit()
        return redirect(url_for("eps"))

    new_code = next_eps_code()
    return render_template("eps_form.html", sections=SECTIONS, active="eps",
                           mode="add", record=None, new_code=new_code)


@app.route("/eps/edit/<int:record_id>", methods=["GET", "POST"])
def eps_edit(record_id):
    if not is_admin():
        abort(403)

    record = EPSRecord.query.get_or_404(record_id)

    if request.method == "POST":
        dr = request.form.get("date_received")
        dc = request.form.get("date_completed")
        date_received   = date.fromisoformat(dr) if dr else None
        date_completed  = date.fromisoformat(dc) if dc else None
        processing_days = compute_processing_days(date_received, date_completed) if date_received and date_completed else None

        record.process         = request.form["process"]
        record.school          = request.form["school"]
        record.date_received   = date_received
        record.status          = request.form["status"]
        record.date_completed  = date_completed
        record.processing_days = processing_days
        record.remarks         = request.form.get("remarks", "")
        db.session.commit()
        return redirect(url_for("eps"))

    return render_template("eps_form.html", sections=SECTIONS, active="eps",
                           mode="edit", record=record, new_code=record.code)


@app.route("/eps/delete/<int:record_id>", methods=["POST"])
def eps_delete(record_id):
    if not is_superadmin():
        abort(403)
    record = EPSRecord.query.get_or_404(record_id)
    db.session.delete(record)
    db.session.commit()
    return redirect(url_for("eps"))


@app.route("/eps/import", methods=["POST"])
def eps_import():
    if not session.get("is_admin"):
        return jsonify({"success": False, "error": "Unauthorized"}), 403

    data = request.get_json()
    records = data.get("records", [])
    if not records:
        return jsonify({"success": False, "error": "No records provided."})

    try:
        def parse_date(val):
            if not val or str(val).strip() in ("", "—", "None"):
                return None
            for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%b %d, %Y", "%B %d, %Y"):
                try:
                    return datetime.strptime(str(val).strip(), fmt).date()
                except ValueError:
                    continue
            return None

        last = db.session.query(EPSRecord).order_by(EPSRecord.id.desc()).first()
        if last and last.code:
            try:
                counter = int(last.code.split("__")[-1])
            except ValueError:
                counter = 0
        else:
            counter = 0

        for r in records:
            counter += 1
            year = datetime.now().year
            new_code = f"EPS{year}__{counter:02d}"

            proc_days = None
            if r.get("processing_days", "").strip() not in ("", "—"):
                try:
                    proc_days = int(float(r["processing_days"]))
                except ValueError:
                    pass

            new_record = EPSRecord(
                code=new_code,
                process=r.get("process", ""),
                school=r.get("school", ""),
                date_received=parse_date(r.get("date_received")),
                status=r.get("status", ""),
                date_completed=parse_date(r.get("date_completed")),
                processing_days=proc_days,
                remarks=r.get("remarks", ""),
            )
            db.session.add(new_record)

        db.session.commit()
        return jsonify({"success": True})

    except Exception as ex:
        db.session.rollback()
        return jsonify({"success": False, "error": str(ex)})
    

# ── Other section stubs ───────────────────────────────────────────────────────


@app.route("/smme")
def smme():
    return render_template("smme.html", sections=SECTIONS, active="smme")

@app.route("/pr")
def pr():
    return render_template("pr.html", sections=SECTIONS, active="pr")

@app.route("/hrd")
def hrd():
    return render_template("hrd.html", sections=SECTIONS, active="hrd")

@app.route("/yf")
def yf():
    return render_template("yf.html", sections=SECTIONS, active="yf")

@app.route("/smn")
def smn():
    return render_template("smn.html", sections=SECTIONS, active="smn")

@app.route("/shn")
def shn():
    return render_template("shn.html", sections=SECTIONS, active="shn")

@app.route("/drrm")
def drrm():
    return render_template("drrm.html", sections=SECTIONS, active="drrm")

@app.route("/ef")
def ef():
    return render_template("ef.html", sections=SECTIONS, active="ef")


# ── Changelog Feedback API Routes ─────────────────────────────────────────────
# Add these routes alongside your other @app.route definitions
 
@app.route("/api/changelog-feedback/<version>", methods=["GET"])
def api_feedback_get(version):
    """Return all feedback items for a given changelog version."""
    if not is_admin():
        abort(403)
    items = (
        ChangelogFeedback.query
        .filter_by(version=version)
        .order_by(ChangelogFeedback.created_at)
        .all()
    )
    return jsonify([item.to_dict() for item in items])
 
 
@app.route("/api/changelog-feedback/<version>", methods=["POST"])
def api_feedback_add(version):
    """Add one or more feedback items for a changelog version."""
    if not is_admin():
        abort(403)
    data = request.get_json(silent=True) or {}
 
    # Accepts either { "text": "single item" } or { "texts": ["item1", "item2"] }
    texts = data.get("texts") or ([data["text"]] if data.get("text") else [])
    if not texts:
        return jsonify({"error": "No text provided."}), 400
 
    created = []
    for t in texts:
        t = t.strip()
        if not t:
            continue
        item = ChangelogFeedback(version=version, text=t)
        db.session.add(item)
        created.append(item)
 
    db.session.commit()
    return jsonify([item.to_dict() for item in created]), 201
 
 
@app.route("/api/changelog-feedback/item/<int:item_id>/check", methods=["POST"])
def api_feedback_check(item_id):
    """Toggle the checked state of a feedback item."""
    if not is_admin():
        abort(403)
    item = ChangelogFeedback.query.get_or_404(item_id)
    data = request.get_json(silent=True) or {}
    item.checked    = data.get("checked", not item.checked)
    item.checked_at = datetime.utcnow() if item.checked else None
    db.session.commit()
    return jsonify(item.to_dict())
 
 
@app.route("/api/changelog-feedback/item/<int:item_id>", methods=["DELETE"])
def api_feedback_delete(item_id):
    """Delete a feedback item."""
    if not is_admin():
        abort(403)
    item = ChangelogFeedback.query.get_or_404(item_id)
    db.session.delete(item)
    db.session.commit()
    return jsonify({"success": True, "deleted_id": item_id})

# ── Init ──────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    app.run(debug=True)