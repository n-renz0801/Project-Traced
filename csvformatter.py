import pandas as pd
import re
import csv
from datetime import datetime, date, timedelta

# ─── DATE HELPERS ────────────────────────────────────────────────────────────

MONTHS = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}

def fmt(day, month, year):
    year = int(year)
    if year < 100:
        year += 2000
    return f"{int(day):02d}/{int(month):02d}/{year}"

def month_num(name):
    return MONTHS.get(name.lower().strip(".")[:3])

def parse_single(s):
    """Parse one date token → DD/MM/YYYY string, or '' on failure."""
    s = s.strip()
    if not s:
        return ""

    # "09-Jan-26" / "28-Jan-25"
    m = re.fullmatch(r"(\d{1,2})-([A-Za-z]+)-(\d{2,4})", s)
    if m:
        mn = month_num(m.group(2))
        return fmt(m.group(1), mn, m.group(3)) if mn else ""

    # "Jan.26" / "Feb.4, 2026" / "Jan. 27,2026"
    m = re.match(r"([A-Za-z]+)\.?\s*(\d{1,2})[,\s]+(\d{4})", s)
    if m:
        mn = month_num(m.group(1))
        return fmt(m.group(2), mn, m.group(3)) if mn else ""

    # "January 30, 2026"
    m = re.match(r"([A-Za-z]+)\s+(\d{1,2})[,\s]+(\d{4})", s)
    if m:
        mn = month_num(m.group(1))
        return fmt(m.group(2), mn, m.group(3)) if mn else ""

    return ""

def parse_impl_dates(raw):
    """
    Split implementation date field into (start, end) as DD/MM/YYYY strings.
    Handles many messy formats from the source file.
    """
    if raw is None:
        return "", ""
    if isinstance(raw, (datetime, date)):
        d = raw.strftime("%d/%m/%Y")
        return d, d

    s = str(raw).strip()
    if not s or s.lower() == "nan":
        return "", ""

    # Normalise whitespace
    s = re.sub(r"\s+", " ", s)

    # "date1 & date2"
    if " & " in s:
        a, b = s.split(" & ", 1)
        return parse_single(a), parse_single(b)

    # "Jan.26-30, 2026"  →  same month range
    m = re.match(r"([A-Za-z]+)\.?\s*(\d{1,2})-(\d{1,2})[,\s]+(\d{4})", s)
    if m:
        mn = month_num(m.group(1))
        if mn:
            return fmt(m.group(2), mn, m.group(4)), fmt(m.group(3), mn, m.group(4))

    # "Jan. 23, 2026 - February 12, 2026"
    m = re.match(r"(.+\d{4})\s*-\s*(.+\d{4})", s)
    if m:
        return parse_single(m.group(1)), parse_single(m.group(2))

    single = parse_single(s)
    return single, single


def fmt_date_cell(val):
    """
    Convert a cell that may be a datetime, date, Excel serial int, or
    string with a date → DD/MM/YYYY.  Returns '' for blanks/errors.
    """
    if val is None:
        return ""
    if pd.isnull(val):          # catches NaT, NaN, None
        return ""
    if isinstance(val, (datetime, date)):
        return val.strftime("%d/%m/%Y")

    s = str(val).strip()
    if not s or s.lower() in ("nan", "nat"):
        return ""

    # Negative or zero → invalid serial
    try:
        num = float(s)
        if num <= 0:
            return ""
        # Excel serial (days since 1899-12-30)
        d = datetime(1899, 12, 30) + timedelta(days=int(num))
        return d.strftime("%d/%m/%Y")
    except ValueError:
        pass

    # Already a date string?  Try DD/MM/YYYY or similar
    for fmt_str in ("%d/%m/%Y", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%m/%d/%Y"):
        try:
            return datetime.strptime(s, fmt_str).strftime("%d/%m/%Y")
        except ValueError:
            pass

    return s  # return as-is if nothing matched


# ─── TOPIC / MATRIX HELPER ───────────────────────────────────────────────────

def clean_topic(text):
    if not text or str(text).strip().lower() in ("", "nan"):
        return ""

    s = re.sub(r"\s+", " ", str(text)).strip()

    # ── numbered list: "1." "2." etc. ──
    parts = re.split(r"(?<!\d)(\d+)\.\s+", s)
    if len(parts) > 2:
        items = []
        i = 1
        while i < len(parts) - 1:
            item_text = parts[i + 1].strip().rstrip(";")
            if item_text:
                items.append(f"{parts[i]}. {item_text}")
            i += 2
        if items:
            return "\n".join(items)

    # ── bullet list: • or · ──
    if "•" in s or "·" in s:
        raw_items = re.split(r"[•·]\s*", s)
        items = ["• " + i.strip().rstrip(";") for i in raw_items if i.strip()]
        if items:
            return "\n".join(items)

    # ── lettered list: a. b. c. ──
    parts = re.split(r"(?<![A-Za-z])([a-d])\.\s+", s)
    if len(parts) > 2:
        items = []
        i = 1
        while i < len(parts) - 1:
            item_text = parts[i + 1].strip().rstrip(";")
            if item_text:
                items.append(f"{parts[i]}. {item_text}")
            i += 2
        if items:
            return "\n".join(items)

    return s


# ─── MAIN ────────────────────────────────────────────────────────────────────

INPUT_FILE  = "hrdfiles.xlsx"
OUTPUT_FILE = "hrd.csv"

HEADERS = [
    "code", "Process", "Name of School", "Title",
    "Implementation Date Start", "Implementation Date End",
    "Venue",
    "Participants M", "Participants F", "Participants T",
    "Evaluation Rating",
    "Topic/Matrix",
    "Date Received", "Status", "Date Completed / Forwarded",
    "Processing Time (Days)", "Remarks",
]

# Read without dtype=str so pandas keeps datetime cells as proper datetime objects
df = pd.read_excel(INPUT_FILE, header=None)

rows_out = []

for _, row in df.iterrows():
    cols = list(row)

    # Pad to at least 16 columns
    while len(cols) < 16:
        cols.append("")

    def raw(i):
        """Return the raw cell value (datetime preserved)."""
        return cols[i] if i < len(cols) else None

    def cell(i):
        """Return cell as a clean string (for non-date columns)."""
        v = raw(i)
        if v is None or (isinstance(v, float) and pd.isna(v)):
            return ""
        return str(v).strip()

    code        = cell(0)
    if not code or code.lower() in ("nan", "nat"):
        continue

    process     = cell(1)
    school      = cell(2)
    title       = cell(3)
    impl_raw    = cell(4)          # implementation date kept as string — it's free-text
    venue       = cell(5)
    part_m      = cell(6)
    part_f      = cell(7)
    part_t      = cell(8)
    eval_rating = cell(9)
    topic_raw   = cell(10)
    date_recv   = fmt_date_cell(raw(11))   # pass raw so datetime type is preserved
    status      = cell(12)
    date_compl  = fmt_date_cell(raw(13))   # same
    proc_time   = cell(14)
    remarks     = cell(15)



    # Fix negative/invalid processing time
    try:
        pt = float(proc_time)
        proc_time = "" if pt < 0 else str(int(pt))
    except (ValueError, TypeError):
        pass

    date_start, date_end = parse_impl_dates(impl_raw)
    topic = clean_topic(topic_raw)

    rows_out.append([
        code, process, school, title,
        date_start, date_end,
        venue,
        part_m, part_f, part_t,
        eval_rating,
        topic,
        date_recv, status, date_compl,
        proc_time, remarks,
    ])

with open(OUTPUT_FILE, "w", newline="", encoding="utf-8-sig") as f:
    writer = csv.writer(f, quoting=csv.QUOTE_ALL)
    writer.writerow(HEADERS)
    writer.writerows(rows_out)

print(f"Done — {len(rows_out)} rows written to {OUTPUT_FILE}")