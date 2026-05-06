from flask import Flask, render_template, request, redirect, url_for, jsonify, session, abort
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import func
from datetime import date, timedelta, datetime
import holidays
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'postgresql://project_traced_user:IJx98IB2sDqKIcu7pCGFCGOxJGEHBCui@dpg-d7qel2jrjlhs73cie6a0-a.ohio-postgres.render.com/project_traced'
app.config['SECRET_KEY'] = 'projectTRACEDkey123'
db = SQLAlchemy(app)

# ── Admin Model ───────────────────────────────────────────────────────────────
class Admin(db.Model):
    __tablename__ = 'admins'
    id         = db.Column(db.Integer, primary_key=True)
    username   = db.Column(db.String(100), unique=True, nullable=False)
    password   = db.Column(db.String(255), nullable=False)
    role       = db.Column(db.String(20), default='admin')
    created_at = db.Column(db.DateTime, server_default=func.now())

    def to_dict(self):
        return {'id': self.id, 'username': self.username, 'role': self.role, 'created_at': self.created_at.isoformat()}


# ── Generic Section Record Model ──────────────────────────────────────────────
class SectionRecord(db.Model):
    __tablename__ = 'section_records'

    id              = db.Column(db.Integer, primary_key=True)
    section         = db.Column(db.String(20), nullable=False, index=True)
    code            = db.Column(db.String(30), unique=True, nullable=False)
    process         = db.Column(db.String(200), nullable=False)
    school          = db.Column(db.String(200), nullable=False)
    date_received   = db.Column(db.Date, nullable=True)
    status          = db.Column(db.String(100), nullable=False)
    date_completed  = db.Column(db.Date, nullable=True)
    processing_days = db.Column(db.Integer, nullable=True)
    remarks         = db.Column(db.Text, nullable=True)

    # ── HRD-only columns (nullable, ignored by all other sections) ──────
    hrd_title           = db.Column(db.String(300), nullable=True)
    hrd_impl_date_start = db.Column(db.Date,        nullable=True)
    hrd_impl_date_end   = db.Column(db.Date,        nullable=True)
    hrd_venue           = db.Column(db.String(300), nullable=True)
    hrd_participants_m  = db.Column(db.Integer,     nullable=True)
    hrd_participants_f  = db.Column(db.Integer,     nullable=True)
    hrd_eval_rating     = db.Column(db.Numeric(4,2),nullable=True)
    hrd_topic_matrix    = db.Column(db.Text,        nullable=True)

    def to_dict(self):
        d = {
            'id':              self.id,
            'section':         self.section,
            'code':            self.code,
            'process':         self.process,
            'school':          self.school,
            'date_received':   self.date_received.isoformat()  if self.date_received  else '',
            'status':          self.status,
            'date_completed':  self.date_completed.isoformat() if self.date_completed else '',
            'processing_days': self.processing_days,
            'remarks':         self.remarks or '',
        }
        if self.section == 'hrd':
            d.update({
                'hrd_title':           self.hrd_title or '',
                'hrd_impl_date_start': self.hrd_impl_date_start.isoformat() if self.hrd_impl_date_start else '',
                'hrd_impl_date_end':   self.hrd_impl_date_end.isoformat()   if self.hrd_impl_date_end   else '',
                'hrd_venue':           self.hrd_venue or '',
                'hrd_participants_m':  self.hrd_participants_m,
                'hrd_participants_f':  self.hrd_participants_f,
                'hrd_participants_t':  (
                    (self.hrd_participants_m or 0) + (self.hrd_participants_f or 0)
                    if self.hrd_participants_m is not None or self.hrd_participants_f is not None
                    else None
                ),
                'hrd_eval_rating':     float(self.hrd_eval_rating) if self.hrd_eval_rating is not None else None,
                'hrd_topic_matrix':    self.hrd_topic_matrix or '',
            })
        return d


# ── Feedback Model ────────────────────────────────────────────────────────────
class FeedbackRating(db.Model):
    __tablename__ = 'feedback_ratings'
    id           = db.Column(db.Integer, primary_key=True)
    rating       = db.Column(db.Integer, nullable=False)
    submitted_at = db.Column(db.DateTime, server_default=func.now(), nullable=False)

    def to_dict(self):
        return {'id': self.id, 'rating': self.rating, 'submitted_at': self.submitted_at.isoformat()}


    

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

def next_code(section_key: str) -> str:
    prefix = section_key.upper()
    year = date.today().year
    last = (
        SectionRecord.query
        .filter_by(section=section_key)
        .filter(SectionRecord.code.like(f'{prefix}{year}__%'))
        .order_by(SectionRecord.id.desc())
        .first()
    )
    if last:
        try:
            num = int(last.code.split('__')[-1]) + 1
        except ValueError:
            num = 1
    else:
        num = 1
    return f'{prefix}{year}__{num:02d}'

def get_section_stats(section_key: str) -> dict:
    count = SectionRecord.query.filter_by(section=section_key).count()
    avg = db.session.query(func.avg(SectionRecord.processing_days))\
        .filter(SectionRecord.section == section_key).scalar()
    return {
        'record_count': count,
        'avg_processing_days': round(float(avg), 1) if avg is not None else None,
    }

def get_feedback_stats() -> dict:
    total = db.session.query(func.count(FeedbackRating.id)).scalar() or 0
    avg   = db.session.query(func.avg(FeedbackRating.rating)).scalar()
    dist_rows = (
        db.session.query(FeedbackRating.rating, func.count(FeedbackRating.id))
        .group_by(FeedbackRating.rating).all()
    )
    distribution = {i: 0 for i in range(1, 6)}
    for rating, cnt in dist_rows:
        distribution[rating] = cnt
    return {
        'total_responses': total,
        'avg_rating':      round(float(avg), 1) if avg else None,
        'distribution':    distribution,
    }

def parse_date(val):
    if not val or str(val).strip() in ('', '—', 'None'):
        return None
    for fmt in ('%Y-%m-%d', '%d/%m/%Y', '%m/%d/%Y', '%b %d, %Y', '%B %d, %Y'):
        try:
            return datetime.strptime(str(val).strip(), fmt).date()
        except ValueError:
            continue
    return None


# ── Section Config ────────────────────────────────────────────────────────────
# Each section defines its own process list. Everything else is shared.

SECTION_PROCESSES = {
    'ces':  ['SIP/AIP Evaluation', 'Budget Realignment', 'Project Proposal/Concept Paper Evaluation', 'Resource Speaker Invitation', 'Certification (Utilization/Adoption)'],
    'eps':  ['SSC Registration', 'Resource Speaker Invitation'],
    'smme': ['Crafting of M&E Tool', 'Resource Speaker Invitation'],
    'pr':   ['Permit to Conduct Study', 'Request for Substitute Teacher', 'Resource Speaker Invitation'],
    'hrd':  ['INSET Proposal Evaluation', 'LAC Proposal Evaluation', 'GAD Proposal Evaluation', 'Resource Speaker Invitation'],
    'yf':   ['LRP Concerns', 'Resource Speaker Invitation'],
    'smn':  ['Conduct of Off-Campus Activity', 'Resource Speaker Invitation'],
    'shn':  ['Medical & Dental Checkup', 'Resource Speaker Invitation'],
    'drrm': ['School Inspection', 'Resource Speaker Invitation'],
    'ef':   ['School Inspection (With SDO)', 'School Inspection (With LGU)', 'Checking & Approval of Program of Works'],
}

SECTIONS = [
    {'id': 'ces',  'label': 'CES',  'full': 'Chief Education Supervisor'},
    {'id': 'eps',  'label': 'EPS',  'full': 'Education Program Supervisor'},
    {'id': 'smme', 'label': 'SMME', 'full': 'School Management Monitoring and Evaluation'},
    {'id': 'pr',   'label': 'PR',   'full': 'Planning and Research'},
    {'id': 'hrd',  'label': 'HRD',  'full': 'Human Resource Development'},
    {'id': 'yf',   'label': 'YF',   'full': 'Youth Formation'},
    {'id': 'smn',  'label': 'SMN',  'full': 'Social Mobilization and Networking'},
    {'id': 'shn',  'label': 'SHN',  'full': 'School Health and Nutrition'},
    {'id': 'drrm', 'label': 'DRRM', 'full': 'Disaster Risk Reduction Management'},
    {'id': 'ef',   'label': 'EF',   'full': 'Education Facilities'},
]

SCHOOLS = [
    'Antipolo City National Science and Technology HS', 'Antipolo City Senior HS',
    'Antipolo City SPED Center', 'Antipolo NHS', 'Apia Integrated School',
    'Bagong Nayon I ES', 'Bagong Nayon II ES', 'Bagong Nayon II NHS', 'Bagong Nayon IV ES',
    'Binayoyo Integrated School', 'Cabading ES', 'Calawis ES', 'Calawis NHS',
    'Canumay ES', 'Canumay NHS', 'Cupang ES', 'Cupang ES Annex', 'Cupang NHS',
    'Dalig ES', 'Dalig NHS', 'Dela Paz ES', 'Dela Paz NHS', 'Inuman ES',
    'Isaias S. Tapales ES', 'Jesus S. Cabarrus ES', 'Juan Sumulong ES', 'Kaila ES',
    'Kaysakat ES', 'Kaysakat NHS', 'Knights of Columbus ES', 'Libis ES', 'Lores ES',
    'Mambugan I ES', 'Mambugan II ES', 'Mambugan NHS', 'Marcelino M. Santos NHS',
    'Maximo L. Gatlabayan Memorial NHS', 'Mayamot ES', 'Mayamot NHS',
    'Muntindilaw ES', 'Muntindilaw NHS', 'Nazarene Ville ES', 'Old Boso-boso ES',
    'Old Boso-boso NHS', 'Paglitaw ES', 'Pantay ES', 'Peace Village ES',
    'Peñafrancia ES', 'Peñafrancia ES Annex', 'Rizza ES', 'Rizza NHS',
    'San Antonio Village ES', 'San Isidro ES', 'San Isidro NHS', 'San Jose NHS',
    'San Joseph ES', 'San Juan NHS', 'San Luis ES', 'San Roque NHS', 'San Ysiro ES',
    'Sapinit ES', 'Sta. Cruz ES', 'Sumilang ES', 'Taguete ES', 'Tanza ES',
    'Teofila Z. Rovero Memorial ES', 'Upper Kilingan ES', 'CID', 'OSDS', 'SGOD', 'Others',
]

STATUSES = ['Not yet started', 'On-going', 'Completed', 'Forwarded to CID', 'Forwarded to OSDS', 'Scheduled', 'Rescheduled']

def sections_with_stats() -> list:
    result = []
    for section in SECTIONS:
        s = dict(section)
        s.update(get_section_stats(s['id']))
        result.append(s)
    return result

def get_section_meta(section_key):
    """Return the SECTIONS entry for a given key, or 404."""
    meta = next((s for s in SECTIONS if s['id'] == section_key), None)
    if not meta:
        abort(404)
    return meta

CHANGELOG = [
    {
        "version": "v1.6",
        "date": "May 6, 2026",
        "color": "blue",
        "title": "Access control improvements, bulk actions & UI refinements",
        "entries": [
            {
            "tag": "feat",
            "text": "Restricted changelog access to superadmin and authorized user (Jho) only"
            },
            {
            "tag": "feat",
            "text": "Added selection-based deletion and bulk deletion functionality for records"
            },
            {
            "tag": "fix",
            "text": "Resolved issue where checkboxes remained visible after superadmin logout"
            },
            {
            "tag": "improve",
            "text": "Refactored codebase to introduce a unified template structure across all sections"
            },
            {
            "tag": "improve",
            "text": "Implemented visual alert: background turns red when processing days exceed limit"
            },
            {
            "tag": "improve",
            "text": "Updated font color of TRACED subtitle on Home Page for better visibility"
            },
            {
            "tag": "chore",
            "text": "Removed unnecessary and unused files to streamline the project structure"
            }
        ]
    },
    {
        "version": "v1.5",
        "date": "May 5, 2026",
        "color": "gray",
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

# ── Home ──────────────────────────────────────────────────────────────────────
@app.route('/')
def home():
    return render_template('home.html',
        sections=sections_with_stats(), active='home',
        feedback_stats=get_feedback_stats(),
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
    session.pop('admin_role', None)   # ← add this
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


# ── Generic Section Routes (one set handles ALL sections) ────────────────────

@app.route('/<section_key>')
def section_view(section_key):
    meta = get_section_meta(section_key)
    records = SectionRecord.query.filter_by(section=section_key).order_by(SectionRecord.id).all()
    return render_template('section.html',
        sections=SECTIONS, active=section_key,
        meta=meta, records=records,
        section_key=section_key,
    )

@app.route('/<section_key>/add', methods=['GET', 'POST'])
def section_add(section_key):
    if not is_admin():
        abort(403)
    meta = get_section_meta(section_key)
    if request.method == 'POST':
        dr = request.form.get('date_received')
        dc = request.form.get('date_completed')
        date_received  = date.fromisoformat(dr) if dr else None
        date_completed = date.fromisoformat(dc) if dc else None

        record = SectionRecord(
            section         = section_key,
            code            = next_code(section_key),
            process         = request.form['process'],
            school          = request.form['school'],
            date_received   = date_received,
            status          = request.form['status'],
            date_completed  = date_completed,
            processing_days = compute_processing_days(date_received, date_completed) if date_received and date_completed else None,
            remarks         = request.form.get('remarks', ''),
        )

        # ── HRD extras ──────────────────────────────────────────────────
        if section_key == 'hrd':
            ids  = request.form.get('hrd_impl_date_start')
            ide  = request.form.get('hrd_impl_date_end')
            pm   = request.form.get('hrd_participants_m')
            pf   = request.form.get('hrd_participants_f')
            er   = request.form.get('hrd_eval_rating')
            record.hrd_title           = request.form.get('hrd_title', '')
            record.hrd_impl_date_start = date.fromisoformat(ids) if ids else None
            record.hrd_impl_date_end   = date.fromisoformat(ide) if ide else None
            record.hrd_venue           = request.form.get('hrd_venue', '')
            record.hrd_participants_m  = int(pm) if pm else None
            record.hrd_participants_f  = int(pf) if pf else None
            record.hrd_eval_rating     = float(er) if er else None
            record.hrd_topic_matrix    = request.form.get('hrd_topic_matrix', '')

        db.session.add(record)
        db.session.commit()
        return redirect(url_for('section_view', section_key=section_key))

    return render_template('section_form.html',
        sections=SECTIONS, active=section_key,
        meta=meta, mode='add', record=None,
        new_code=next_code(section_key),
        processes=SECTION_PROCESSES.get(section_key, []),
        schools=SCHOOLS,
        statuses=STATUSES,
        section_key=section_key,
    )


@app.route('/<section_key>/edit/<int:record_id>', methods=['GET', 'POST'])
def section_edit(section_key, record_id):
    if not is_admin():
        abort(403)
    meta = get_section_meta(section_key)
    record = SectionRecord.query.filter_by(id=record_id, section=section_key).first_or_404()
    if request.method == 'POST':
        dr = request.form.get('date_received')
        dc = request.form.get('date_completed')
        date_received  = date.fromisoformat(dr) if dr else None
        date_completed = date.fromisoformat(dc) if dc else None

        record.process         = request.form['process']
        record.school          = request.form['school']
        record.date_received   = date_received
        record.status          = request.form['status']
        record.date_completed  = date_completed
        record.processing_days = compute_processing_days(date_received, date_completed) if date_received and date_completed else None
        record.remarks         = request.form.get('remarks', '')

        # ── HRD extras ──────────────────────────────────────────────────
        if section_key == 'hrd':
            ids  = request.form.get('hrd_impl_date_start')
            ide  = request.form.get('hrd_impl_date_end')
            pm   = request.form.get('hrd_participants_m')
            pf   = request.form.get('hrd_participants_f')
            er   = request.form.get('hrd_eval_rating')
            record.hrd_title           = request.form.get('hrd_title', '')
            record.hrd_impl_date_start = date.fromisoformat(ids) if ids else None
            record.hrd_impl_date_end   = date.fromisoformat(ide) if ide else None
            record.hrd_venue           = request.form.get('hrd_venue', '')
            record.hrd_participants_m  = int(pm) if pm else None
            record.hrd_participants_f  = int(pf) if pf else None
            record.hrd_eval_rating     = float(er) if er else None
            record.hrd_topic_matrix    = request.form.get('hrd_topic_matrix', '')

        db.session.commit()
        return redirect(url_for('section_view', section_key=section_key))

    return render_template('section_form.html',
        sections=SECTIONS, active=section_key,
        meta=meta, mode='edit', record=record,
        new_code=record.code,
        processes=SECTION_PROCESSES.get(section_key, []),
        schools=SCHOOLS,
        statuses=STATUSES,
        section_key=section_key,
    )

@app.route('/<section_key>/delete/<int:record_id>', methods=['POST'])
def section_delete(section_key, record_id):
    if not is_superadmin():
        abort(403)
    get_section_meta(section_key)
    record = SectionRecord.query.filter_by(id=record_id, section=section_key).first_or_404()
    db.session.delete(record)
    db.session.commit()
    return redirect(url_for('section_view', section_key=section_key))

@app.route('/<section_key>/bulk-delete', methods=['POST'])
def section_bulk_delete(section_key):
    if not is_superadmin():
        return jsonify({'success': False, 'error': 'Unauthorized'}), 403
    get_section_meta(section_key)
    data = request.get_json(silent=True) or {}
    ids = data.get('ids', [])
    if not ids:
        return jsonify({'success': False, 'error': 'No IDs provided.'})
    try:
        deleted = (
            SectionRecord.query
            .filter(
                SectionRecord.id.in_(ids),
                SectionRecord.section == section_key
            )
            .all()
        )
        for record in deleted:
            db.session.delete(record)
        db.session.commit()
        return jsonify({'success': True, 'deleted_count': len(deleted)})
    except Exception as ex:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(ex)})

@app.route('/<section_key>/import', methods=['POST'])
def section_import(section_key):
    if not session.get('is_admin'):
        return jsonify({'success': False, 'error': 'Unauthorized'}), 403
    get_section_meta(section_key)
    data = request.get_json()
    records = data.get('records', [])
    if not records:
        return jsonify({'success': False, 'error': 'No records provided.'})
    try:
        last = SectionRecord.query.filter_by(section=section_key).order_by(SectionRecord.id.desc()).first()
        if last and last.code:
            try:
                counter = int(last.code.split('__')[-1])
            except ValueError:
                counter = 0
        else:
            counter = 0

        for r in records:
            counter += 1
            new_code = f"{section_key.upper()}{datetime.now().year}__{counter:02d}"
            proc_days = None
            raw_days = str(r.get('processing_days', '')).strip()
            if raw_days not in ('', '—'):
                try:
                    proc_days = int(float(raw_days))
                except ValueError:
                    pass

            record = SectionRecord(
                section         = section_key,
                code            = new_code,
                process         = r.get('process', ''),
                school          = r.get('school', ''),
                date_received   = parse_date(r.get('date_received')),
                status          = r.get('status', ''),
                date_completed  = parse_date(r.get('date_completed')),
                processing_days = proc_days,
                remarks         = r.get('remarks', ''),
            )

            # ── HRD-only fields ──────────────────────────────────────────
            if section_key == 'hrd':
                def safe_int(val):
                    try:
                        return int(float(val)) if str(val).strip() not in ('', '—') else None
                    except (ValueError, TypeError):
                        return None

                def safe_float(val):
                    try:
                        return float(val) if str(val).strip() not in ('', '—') else None
                    except (ValueError, TypeError):
                        return None

                record.hrd_title           = r.get('title', '')
                record.hrd_impl_date_start = parse_date(r.get('impl_date_start'))
                record.hrd_impl_date_end   = parse_date(r.get('impl_date_end'))
                record.hrd_venue           = r.get('venue', '')
                record.hrd_participants_m  = safe_int(r.get('participants_m'))
                record.hrd_participants_f  = safe_int(r.get('participants_f'))
                record.hrd_eval_rating     = safe_float(r.get('eval_rating'))
                record.hrd_topic_matrix    = r.get('topic_matrix', '')

            db.session.add(record)

        db.session.commit()
        return jsonify({'success': True})
    except Exception as ex:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(ex)})


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