from flask import Flask, render_template, request, redirect, url_for, jsonify
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import func
from datetime import date, timedelta
import holidays

app = Flask(__name__)
# app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///database.db'
app.config['SQLALCHEMY_DATABASE_URI'] = 'postgresql://project_traced_user:IJx98IB2sDqKIcu7pCGFCGOxJGEHBCui@dpg-d7qel2jrjlhs73cie6a0-a.ohio-postgres.render.com/project_traced'
db = SQLAlchemy(app)


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


# ── Helpers ───────────────────────────────────────────────────────────────────

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


# ── Navigation ────────────────────────────────────────────────────────────────

# Base section definitions — stats are injected at request time in home()
SECTIONS = [
    {"id": "ces",  "label": "CES",  "full": "Chief Education Supervisor"},
    {"id": "eps",  "label": "EPS",  "full": "Education Program Supervisor"},
    {"id": "smme", "label": "SMME", "full": "School Management Monitoring and Evaluation"},
    {"id": "pr",   "label": "PR",   "full": "Planning and Research"},
    {"id": "hrd",  "label": "HRD",  "full": "Human Resource Development"},
    {"id": "yf",   "label": "YF",   "full": "Youth Formation"},
    {"id": "smn",  "label": "SMN",  "full": "Social Mobilization and Network"},
    {"id": "shn",  "label": "SHN",  "full": "School Health and Nutrition"},
    {"id": "drrm", "label": "DRRM", "full": "Disaster Risk Reduction Management"},
    {"id": "ef",   "label": "EF",   "full": "Education Facilities"},
]

# Map each section id to its stats-fetching function.
# Add entries here as you build out other sections.
SECTION_STATS_FN = {
    "ces": get_ces_stats,
    # "eps": get_eps_stats,   ← add when EPS model/stats are ready
}


def sections_with_stats() -> list:
    """Return SECTIONS list with record_count and avg_processing_days injected."""
    result = []
    for section in SECTIONS:
        s = dict(section)  # copy so we don't mutate the global
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
    return render_template("home.html", sections=sections_with_stats(), active="home")


# ── CES ──────────────────────────────────────────────────────────────────────

@app.route("/ces")
def ces():
    records = CESRecord.query.order_by(CESRecord.id).all()
    return render_template("ces.html", sections=SECTIONS, active="ces", records=records)


@app.route("/ces/add", methods=["GET", "POST"])
def ces_add():
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
    record = CESRecord.query.get_or_404(record_id)
    db.session.delete(record)
    db.session.commit()
    return redirect(url_for("ces"))


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


# ── Other section stubs ───────────────────────────────────────────────────────

@app.route("/eps")
def eps():
    return render_template("eps.html", sections=SECTIONS, active="eps")

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


# ── Init ──────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    app.run(debug=True)