"""
Extract structured leaderboard data from Blainroe Golf Club publish PDFs.

Inputs (in a single folder):
  - Captain's Eclectic Cup (Gross)*.pdf
  - Captain's Eclectic Cup (Nett)*.pdf
  - Golfer of the Year*.pdf
  - Gross Eclectic Insights*.pdf
  - Nett Eclectic Insights*.pdf

Output:
  A single JSON file with structured snapshot data.

Usage:
  python extract_leaderboards.py <snapshot_folder> <output_json>
"""
import sys
import re
import json
import io
from pathlib import Path
from pypdf import PdfReader

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')


def find_pdf(folder: Path, pattern: str) -> Path | None:
    """Find a PDF in folder matching the given substring (case-insensitive)."""
    candidates = [p for p in folder.glob('*.pdf') if pattern.lower() in p.name.lower()]
    if not candidates:
        return None
    return sorted(candidates, key=lambda p: len(p.name))[0]


def extract_text(pdf: Path) -> str:
    """Extract all text from a PDF."""
    reader = PdfReader(str(pdf))
    return '\n'.join(page.extract_text() or '' for page in reader.pages)


# Parse the GOY table. Lines like:
#   "1 55 5 Terence Ryan 14 0 12 3 19 0 7 0 0 0 0 0 0 0 0 0 0"
# or in 17-event format. Rank may repeat for ties.
GOY_ROW_RE = re.compile(
    r'^\s*(\d+)\s+(\d+)\s+(\d+)\s+([A-Z][^\d]+?)\s+'
    r'(\d+(?:\s+\d+){16})\s*$'
)


def parse_goy(text: str) -> dict:
    """Parse Golfer of the Year leaderboard text.

    Returns: { 'leader': name|None, 'players': [{ 'rank', 'points', 'events',
               'name', 'scores': [int*17] }] }
    """
    players: list[dict] = []
    leader = None
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        m_leader = re.search(r'Current Leader[: ]+([^\n]+)$', line)
        if m_leader:
            leader = m_leader.group(1).strip()
            continue
        m = GOY_ROW_RE.match(line)
        if not m:
            continue
        rank = int(m.group(1))
        points = int(m.group(2))
        events = int(m.group(3))
        name = m.group(4).strip()
        scores = [int(x) for x in m.group(5).split()]
        players.append({
            'rank': rank,
            'points': points,
            'events': events,
            'name': name,
            'scores': scores,
        })
    return {'leader': leader, 'players': players}


# Parse Eclectic Cup tables. Two formats:
#   Gross: "1 Luke Byrne 9 4 4 3 4 3 3 4 2 3 30 4 3 4 4 3 3 3 3 4 31 61"
#          rank name [(last X)] rounds h1..h9 out h10..h18 in gross
#   Nett:  "1 Joseph Gill 11 4 4 5 4 5 4 4 3 4 37 4 4 3 5 4 3 5 2 5 35 72 19 53"
#          rank name [(last X)] rounds h1..h9 out h10..h18 in gross hcap nett
ECLECTIC_ROW_RE = re.compile(
    r'^\s*(\d+)\s+'
    r'(.+?)'                                                    # name
    r'(?:\s+\(last (?:\d+|hole)\))?\s+'                         # optional (last X)
    r'(\d+)\s+'                                                 # rounds
    r'((?:\d+\s+){9})'                                          # holes 1-9
    r'(\d+)\s+'                                                 # OUT
    r'((?:\d+\s+){9})'                                          # holes 10-18
    r'(\d+)\s+'                                                 # IN
    r'(\d+)'                                                    # gross
    r'(?:\s+(\d+)\s+(\d+))?'                                    # optional hcap + nett
    r'\s*$'
)


def parse_eclectic(text: str) -> dict:
    """Parse an Eclectic Cup leaderboard (Gross or Nett).

    Returns: { 'players': [{ 'rank', 'name', 'rounds', 'gross', 'hcap',
               'nett', 'out', 'in' }] }. hcap/nett may be None for Gross PDFs.
    """
    players: list[dict] = []
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith('Par '):
            continue
        m = ECLECTIC_ROW_RE.match(line)
        if not m:
            continue
        rank = int(m.group(1))
        name = m.group(2).strip()
        if name.lower() in {'overall', 'name', 'overalloverall nameame'}:
            continue
        if any(c.isdigit() for c in name.split()[0]):
            continue
        rounds = int(m.group(3))
        out_score = int(m.group(5))
        in_score = int(m.group(7))
        gross = int(m.group(8))
        hcap = int(m.group(9)) if m.group(9) else None
        nett = int(m.group(10)) if m.group(10) else None
        players.append({
            'rank': rank,
            'name': name,
            'rounds': rounds,
            'out': out_score,
            'in': in_score,
            'gross': gross,
            'hcap': hcap,
            'nett': nett,
        })
    return {'players': players}


# Insights stats parsing. Stats values appear on their own lines as numbers
# followed by a label on the next line. e.g.:
#   295
#   Players
def parse_insights(text: str) -> dict:
    """Parse Eclectic Insights PDF to pull headline numbers and records.

    Returns: { 'players', 'full_cards', 'eagles', 'birdies', 'pars',
               'best_score', 'avg_score', 'avg_handicap', 'leader',
               'front_9_record', 'back_9_record', 'record_card' }
    """
    stats: dict = {}
    lines = [l.strip() for l in text.splitlines() if l.strip()]

    def grab_int_before(label: str) -> int | None:
        for i, l in enumerate(lines):
            if l == label and i > 0:
                m = re.match(r'^([\d,]+)$', lines[i - 1])
                if m:
                    return int(m.group(1).replace(',', ''))
        return None

    def grab_float_before(label: str) -> float | None:
        for i, l in enumerate(lines):
            if l == label and i > 0:
                m = re.match(r'^(\d+(?:\.\d+)?)$', lines[i - 1])
                if m:
                    return float(m.group(1))
        return None

    def grab_text_before(label: str) -> str | None:
        for i, l in enumerate(lines):
            if l == label and i > 0:
                prev = lines[i - 1]
                if not re.match(r'^[\d,.]+$', prev):
                    return prev
        return None

    stats['players'] = grab_int_before('Players')
    stats['full_cards'] = grab_int_before('Full Cards') or grab_int_before('Full Nett Cards')
    stats['eagles'] = grab_int_before('🟡  Eagles') or grab_int_before('🟡  Nett Eagles')
    stats['birdies'] = grab_int_before('🔴  Birdies') or grab_int_before('🔴  Nett Birdies')
    stats['pars'] = grab_int_before('🟢  Pars') or grab_int_before('🟢  Nett Pars')
    stats['best_score'] = grab_int_before('Best Gross') or grab_int_before('Best Nett')
    stats['avg_score'] = grab_float_before('Avg Gross') or grab_float_before('Avg Nett')
    stats['avg_handicap'] = grab_float_before('Avg Handicap')
    stats['leader'] = grab_text_before('Gross Leader') or grab_text_before('Nett Leader')

    # Front 9 / Back 9 records
    stats['front_9_record'] = None
    stats['back_9_record'] = None
    for i, l in enumerate(lines):
        if l.startswith('Front 9'):
            m = re.match(r'Front 9\s+(.+?)\s+(\d+)\s+(-?\d+|\+\d+)\s*$', l)
            if m:
                stats['front_9_record'] = {
                    'player': m.group(1).strip(),
                    'score': int(m.group(2)),
                    'vs_par': m.group(3),
                }
        if l.startswith('Back 9'):
            m = re.match(r'Back 9\s+(.+?)\s+(\d+)\s+(-?\d+|\+\d+)\s*$', l)
            if m:
                stats['back_9_record'] = {
                    'player': m.group(1).strip(),
                    'score': int(m.group(2)),
                    'vs_par': m.group(3),
                }

    # Course record card - look for "Best 3 3 3 3 3 ..."
    for l in lines:
        m = re.match(r'^Best\s+((?:\d+\s+){17}\d+)\s*$', l)
        if m:
            stats['record_card'] = [int(x) for x in m.group(1).split()]
            stats['record_total'] = sum(stats['record_card'])
            break

    # Albatross / Nett Eagle / Eagle clubs - count rows in dedicated sections
    text_block = '\n'.join(lines)
    alb_section = re.search(
        r'Nett Albatross Club.*?(?=📈|📊|Generated|$)',
        text_block, re.DOTALL,
    )
    if alb_section:
        # Each albatross row has format: Player ... 🦅 N <competition>
        stats['nett_albatross_count'] = len(re.findall(r'🦅', alb_section.group(0)))
    return stats


def main():
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)
    folder = Path(sys.argv[1])
    out_path = Path(sys.argv[2])
    if not folder.is_dir():
        print(f'ERROR: folder not found: {folder}')
        sys.exit(1)

    snapshot: dict = {'source_folder': str(folder), 'files': {}}

    targets = [
        ('goy', "Golfer of the Year", parse_goy),
        ('gross', "Captain's Eclectic Cup (Gross)", parse_eclectic),
        ('nett', "Captain's Eclectic Cup (Nett)", parse_eclectic),
        ('gross_insights', "Gross Eclectic Insights", parse_insights),
        ('nett_insights', "Nett Eclectic Insights", parse_insights),
    ]

    missing = []
    for key, pattern, parser in targets:
        pdf = find_pdf(folder, pattern)
        if pdf is None:
            missing.append(pattern)
            snapshot[key] = None
            continue
        snapshot['files'][key] = pdf.name
        text = extract_text(pdf)
        snapshot[key] = parser(text)

    if missing:
        snapshot['missing'] = missing
        print(f'WARNING: missing PDFs: {missing}')

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(snapshot, indent=2, ensure_ascii=False),
                        encoding='utf-8')

    # Print a brief summary
    print(f'\n=== Snapshot saved to {out_path} ===')
    if snapshot.get('goy'):
        print(f"GOY: {len(snapshot['goy']['players'])} players, "
              f"leader: {snapshot['goy']['leader']}")
    if snapshot.get('gross'):
        print(f"Gross Eclectic: {len(snapshot['gross']['players'])} players")
    if snapshot.get('nett'):
        print(f"Nett Eclectic: {len(snapshot['nett']['players'])} players")
    if snapshot.get('gross_insights'):
        gi = snapshot['gross_insights']
        print(f"Gross stats: {gi.get('players')} players, "
              f"{gi.get('birdies')} birdies, "
              f"{gi.get('eagles')} eagles, "
              f"best {gi.get('best_score')}")
    if snapshot.get('nett_insights'):
        ni = snapshot['nett_insights']
        print(f"Nett stats: {ni.get('players')} players, "
              f"{ni.get('birdies')} birdies, "
              f"{ni.get('eagles')} eagles, "
              f"best {ni.get('best_score')}")


if __name__ == '__main__':
    main()
