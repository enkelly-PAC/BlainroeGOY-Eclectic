"""
Generate a weekly newsletter draft from two leaderboard snapshots.

Computes verified deltas (score-anchored, not just position-anchored) and
writes a draft newsletter in the same tone as prior club updates.

Usage:
  python generate_newsletter.py <prior.json> <current.json> <event_name> <output.md>
"""
import sys
import json
import io
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')


def compute_event_scorecard_count(goy_prior: dict, goy_current: dict,
                                  event_index: int | None = None) -> int | None:
    """Count GoY rows that have a non-zero entry in the most recent event
    column compared to the prior snapshot. event_index is 0-based; if None,
    auto-detect the last event added.
    """
    cur_players = goy_current.get('players') or []
    pri_players = goy_prior.get('players') or []
    if not cur_players or not pri_players:
        return None

    # Auto-detect new event column: find first column where the sum across
    # current rows is non-zero but was zero in prior snapshot.
    n_events = len(cur_players[0]['scores'])
    new_event_idx = event_index
    if new_event_idx is None:
        for i in range(n_events):
            cur_total = sum(p['scores'][i] for p in cur_players)
            pri_total = sum(p['scores'][i] if i < len(p['scores']) else 0
                            for p in pri_players)
            if cur_total > 0 and pri_total == 0:
                new_event_idx = i
                break
    if new_event_idx is None:
        return None

    return sum(1 for p in cur_players if p['scores'][new_event_idx] > 0)


def index_by_name(players: list[dict]) -> dict[str, dict]:
    """Build a lookup of player name (lowercase, stripped) to record."""
    out: dict[str, dict] = {}
    for p in players:
        name = clean_name(p['name']).lower()
        out[name] = p
    return out


def clean_name(name: str) -> str:
    """Strip '(last X)' / '(last hole)' suffixes from player names."""
    import re as _re
    return _re.sub(r'\s*\(last (?:\d+|hole)\)\s*$', '', name).strip()


def fmt_name(player: dict) -> str:
    """Format a player's display name."""
    return clean_name(player['name'])


def normalize_leader_name(name: str) -> str:
    """Convert 'Ryan, Terence' to 'Terence Ryan' if applicable."""
    if name and ',' in name:
        parts = [p.strip() for p in name.split(',', 1)]
        if len(parts) == 2:
            return f'{parts[1]} {parts[0]}'
    return name


def list_to_str(items: list[str]) -> str:
    if not items:
        return ''
    if len(items) == 1:
        return items[0]
    if len(items) == 2:
        return f'{items[0]} and {items[1]}'
    return ', '.join(items[:-1]) + f', and {items[-1]}'


def compute_goy_deltas(prior: dict, current: dict) -> dict:
    """Compute GOY changes between two snapshots."""
    prior_idx = index_by_name(prior['players'])
    current_idx = index_by_name(current['players'])

    leader_before = prior['leader']
    leader_after = current['leader']

    # Top event scorers: people who gained points this week (events count
    # increased, or points jumped). Easiest: compare points before vs after.
    event_scorers = []
    for name_lc, cur in current_idx.items():
        prev = prior_idx.get(name_lc)
        prev_points = prev['points'] if prev else 0
        prev_rank = prev['rank'] if prev else None
        prev_events = prev['events'] if prev else 0
        gained = cur['points'] - prev_points
        if gained > 0:
            event_scorers.append({
                'name': clean_name(cur['name']),
                'points_gained': gained,
                'points_before': prev_points,
                'points_after': cur['points'],
                'rank_before': prev_rank,
                'rank_after': cur['rank'],
                'events_before': prev_events,
                'events_after': cur['events'],
            })
    event_scorers.sort(key=lambda r: r['points_gained'], reverse=True)

    # Big movers: prioritise moves into the top of the table (where competition
    # is fiercer), then by absolute rank improvement. A player jumping from
    # 8th to 2nd is more newsworthy than 89th to 27th, even though the latter
    # moved more places.
    def mover_priority(r):
        if r['rank_before'] is None or r['rank_after'] is None:
            return (99, 0)
        improvement = r['rank_before'] - r['rank_after']
        if improvement < 3:
            return (99, 0)
        # Tier by where they landed: top 5, top 10, top 20, else
        if r['rank_after'] <= 5:
            tier = 0
        elif r['rank_after'] <= 10:
            tier = 1
        elif r['rank_after'] <= 20:
            tier = 2
        else:
            tier = 3
        return (tier, -improvement)

    big_movers = [r for r in event_scorers
                  if r['rank_before'] is not None
                  and (r['rank_before'] - r['rank_after']) >= 3]
    big_movers.sort(key=mover_priority)

    return {
        'leader_before': leader_before,
        'leader_after': leader_after,
        'leader_change': leader_before != leader_after,
        'top_5_after': current['players'][:5],
        'top_event_scorers': event_scorers[:10],
        'big_movers': big_movers[:10],
    }


def compute_eclectic_deltas(prior: dict, current: dict,
                            score_field: str) -> dict:
    """Compute Eclectic Cup changes. score_field is 'gross' or 'nett'."""
    prior_idx = index_by_name(prior['players'])
    current_idx = index_by_name(current['players'])

    improvers = []
    for name_lc, cur in current_idx.items():
        prev = prior_idx.get(name_lc)
        if not prev:
            continue
        prev_score = prev.get(score_field)
        cur_score = cur.get(score_field)
        if prev_score is None or cur_score is None:
            continue
        delta = cur_score - prev_score
        if delta < 0:
            improvers.append({
                'name': clean_name(cur['name']),
                'score_before': prev_score,
                'score_after': cur_score,
                'delta': delta,
                'rank_before': prev['rank'],
                'rank_after': cur['rank'],
            })

    # Climb of the week: prioritise improvements that landed in the top of
    # the table (more newsworthy than bottom-of-table churn) and require a
    # meaningful jump.
    def climb_priority(r):
        climb = r['rank_before'] - r['rank_after']
        if climb < 3:
            return (99, 0)
        if r['rank_after'] <= 5:
            tier = 0
        elif r['rank_after'] <= 10:
            tier = 1
        elif r['rank_after'] <= 20:
            tier = 2
        else:
            return (99, 0)
        return (tier, -climb)

    improvers.sort(key=climb_priority)

    # Leaders: collect everyone tied at top score
    if current['players']:
        top_score = current['players'][0].get(score_field)
        leaders_after = [clean_name(p['name']) for p in current['players']
                         if p.get(score_field) == top_score]
    else:
        leaders_after, top_score = [], None
    if prior['players']:
        prior_top = prior['players'][0].get(score_field)
        leaders_before = [clean_name(p['name']) for p in prior['players']
                          if p.get(score_field) == prior_top]
    else:
        leaders_before, prior_top = [], None

    return {
        'leaders_before': leaders_before,
        'leaders_after': leaders_after,
        'top_score_before': prior_top,
        'top_score_after': top_score,
        'leader_change': leaders_before != leaders_after,
        'top_5_after': current['players'][:5],
        'score_improvers': improvers[:10],
    }


def compute_insights_deltas(prior: dict, current: dict) -> dict:
    """Compute the headline stat deltas."""
    def delta(key):
        a = prior.get(key)
        b = current.get(key)
        if a is None or b is None:
            return None
        return b - a

    out = {
        'players_before': prior.get('players'),
        'players_after': current.get('players'),
        'players_delta': delta('players'),
        'birdies_before': prior.get('birdies'),
        'birdies_after': current.get('birdies'),
        'birdies_delta': delta('birdies'),
        'eagles_before': prior.get('eagles'),
        'eagles_after': current.get('eagles'),
        'eagles_delta': delta('eagles'),
        'pars_before': prior.get('pars'),
        'pars_after': current.get('pars'),
        'pars_delta': delta('pars'),
        'best_score_before': prior.get('best_score'),
        'best_score_after': current.get('best_score'),
        'best_score_improved': (
            prior.get('best_score') is not None
            and current.get('best_score') is not None
            and current['best_score'] < prior['best_score']
        ),
        'leader_before': prior.get('leader'),
        'leader_after': current.get('leader'),
        'avg_score_before': prior.get('avg_score'),
        'avg_score_after': current.get('avg_score'),
        'record_card_before': prior.get('record_card'),
        'record_card_after': current.get('record_card'),
        'record_card_changed': (prior.get('record_card')
                                != current.get('record_card')),
        'front_9_before': prior.get('front_9_record'),
        'front_9_after': current.get('front_9_record'),
        'back_9_before': prior.get('back_9_record'),
        'back_9_after': current.get('back_9_record'),
    }

    out['front_9_improved'] = (
        out['front_9_before'] and out['front_9_after']
        and out['front_9_after']['score'] < out['front_9_before']['score']
    )
    out['back_9_improved'] = (
        out['back_9_before'] and out['back_9_after']
        and out['back_9_after']['score'] < out['back_9_before']['score']
    )
    return out


def render_newsletter(event_name: str, deltas: dict) -> str:
    """Render the newsletter draft text."""
    goy = deltas['goy']
    gross = deltas['gross']
    nett = deltas['nett']
    gi = deltas['gross_insights']
    ni = deltas['nett_insights']

    lines: list[str] = []

    # Opening paragraph: high-level stats
    scorecards_added = deltas.get('scorecards_added')
    intro = (f"After a busy {event_name} weekend, the Eclectic and GoY tables "
             f"saw movement across all three races")
    if scorecards_added:
        intro += f", with {scorecards_added} scorecards added"
    intro += "."
    eagles_bit = ''
    if gi['eagles_delta'] is not None:
        if gi['eagles_delta'] == 1:
            eagles_bit = 'There was 1 new Eagle that improved on a hole in the Eclectic'
        elif gi['eagles_delta'] > 1:
            eagles_bit = (f"There were {gi['eagles_delta']} new Eagles "
                          f"that improved on holes in the Eclectic")
    birdies_bit = ''
    if gi['birdies_delta'] is not None and gi['birdies_delta'] > 0:
        birdies_bit = f"{gi['birdies_delta']} new Eclectic Birdies added across the field"
    extras = ' and '.join([b for b in [eagles_bit, birdies_bit] if b])
    if extras:
        intro += f" {extras}."
    lines.append(intro)
    lines.append('')

    # GOY paragraph
    goy_lines: list[str] = []
    top5 = goy['top_5_after']
    if top5:
        leader = top5[0]
        leader_name = clean_name(leader['name'])
        leader_prior_points = None
        for s in goy['top_event_scorers']:
            if s['name'].lower() == leader_name.lower():
                leader_prior_points = s['points_before']
                break
        if goy['leader_change']:
            goy_lines.append(
                f"{leader_name} takes over the GoY lead on {leader['points']} points."
            )
        else:
            if leader_prior_points is not None:
                gained = leader['points'] - leader_prior_points
                if gained > 0:
                    goy_lines.append(
                        f"{leader_name} extends his GoY lead to {leader['points']} "
                        f"points after picking up {gained} from the {event_name}."
                    )
                else:
                    goy_lines.append(
                        f"{leader_name} holds his GoY lead on {leader['points']} points."
                    )
            else:
                goy_lines.append(
                    f"{leader_name} holds his GoY lead on {leader['points']} points."
                )

    # Big mover (priority weighted by rank_after tier)
    headline_mover = None
    if goy['big_movers']:
        headline_mover = goy['big_movers'][0]
        goy_lines.append(
            f"The big story is {headline_mover['name']}, who jumped from "
            f"{headline_mover['rank_before']}{ordinal(headline_mover['rank_before'])} to "
            f"{headline_mover['rank_after']}{ordinal(headline_mover['rank_after'])} on "
            f"{headline_mover['points_after']} points after a "
            f"{headline_mover['points_gained']}-point haul."
        )

    # Top GoY scorer from the event (if different from headline mover)
    if goy['top_event_scorers']:
        top_scorer = goy['top_event_scorers'][0]
        if not headline_mover or top_scorer['name'] != headline_mover['name']:
            climb_text = ''
            if (top_scorer['rank_before'] is not None
                    and (top_scorer['rank_before'] - top_scorer['rank_after']) >= 5):
                climb_text = (f", lifting him from "
                              f"{top_scorer['rank_before']}{ordinal(top_scorer['rank_before'])} "
                              f"to {top_scorer['rank_after']}{ordinal(top_scorer['rank_after'])}")
            goy_lines.append(
                f"{top_scorer['name']} took the top GoY score from the weekend "
                f"on {top_scorer['points_gained']} points{climb_text}."
            )

    if goy_lines:
        lines.append(' '.join(goy_lines))
        lines.append('')

    # Gross Eclectic paragraph
    gross_lines: list[str] = []
    if gross['top_5_after']:
        top_score = gross['top_score_after']
        new_record = (gi['best_score_before'] is not None
                      and top_score < gi['best_score_before'])
        if len(gross['leaders_after']) == 1:
            leader_name = gross['leaders_after'][0]
            if gross['leader_change']:
                tag = f", a new low for the season so far" if new_record else ""
                gross_lines.append(
                    f"In the Gross Eclectic, {leader_name} is now the solo leader "
                    f"on {top_score}{tag}."
                )
            else:
                gross_lines.append(
                    f"In the Gross Eclectic, {leader_name} holds the lead on {top_score}."
                )
        else:
            joined = list_to_str(gross['leaders_after'])
            gross_lines.append(
                f"The Gross Eclectic lead is shared at {top_score} by {joined}."
            )

    # Front 9 improvement (use 'He also' if same as leader)
    if gi['front_9_improved']:
        f9 = gi['front_9_after']
        old = gi['front_9_before']
        gross_lead_name = (gross['leaders_after'][0]
                           if len(gross['leaders_after']) == 1 else None)
        prefix = 'He also' if (gross_lead_name == f9['player']) else f"{f9['player']}"
        gross_lines.append(
            f"{prefix} set a new Front 9 record of {f9['score']} "
            f"({f9['vs_par']}), beating the previous {old['score']}."
        )
    if gi['back_9_improved']:
        b9 = gi['back_9_after']
        old = gi['back_9_before']
        gross_lines.append(
            f"{b9['player']} set a new Back 9 record of {b9['score']} "
            f"({b9['vs_par']}), beating the previous {old['score']}."
        )

    if gross_lines:
        lines.append(' '.join(gross_lines))
        lines.append('')

    # Nett Eclectic paragraph
    nett_lines: list[str] = []
    if nett['top_5_after']:
        top_score = nett['top_score_after']
        new_record = (ni['best_score_before'] is not None
                      and top_score < ni['best_score_before'])
        if len(nett['leaders_after']) == 1:
            leader_name = nett['leaders_after'][0]
            tied_at_second = [p['name'] for p in nett['top_5_after'][1:]
                              if p.get('nett') == nett['top_5_after'][1].get('nett')]
            if nett['leader_change']:
                tag = ", a new low for the season so far" if new_record else ""
                second_score = nett['top_5_after'][1].get('nett') if len(nett['top_5_after']) > 1 else None
                if tied_at_second and second_score is not None:
                    nett_lines.append(
                        f"In the Nett Eclectic, there is a new solo leader: "
                        f"{leader_name} on {top_score}{tag}, ahead of a "
                        f"{len(tied_at_second)}-way tie at {second_score} between "
                        f"{list_to_str(tied_at_second)}."
                    )
                else:
                    nett_lines.append(
                        f"In the Nett Eclectic, {leader_name} now leads on {top_score}{tag}."
                    )
            else:
                nett_lines.append(
                    f"In the Nett Eclectic, {leader_name} holds the lead on {top_score}."
                )
        else:
            joined = list_to_str(nett['leaders_after'])
            nett_lines.append(
                f"The Nett Eclectic lead is shared at {top_score} by {joined}."
            )

    # Biggest nett climber (already filtered to top-20 landings only)
    if nett['score_improvers']:
        top_climber = nett['score_improvers'][0]
        nett_lines.append(
            f"{top_climber['name']} had the climb of the week, moving from "
            f"{top_climber['rank_before']}{ordinal(top_climber['rank_before'])} to "
            f"{top_climber['rank_after']}{ordinal(top_climber['rank_after'])}, "
            f"improving his Nett score by {abs(top_climber['delta'])} shots."
        )

    if nett_lines:
        lines.append(' '.join(nett_lines))
        lines.append('')

    # Closing on the record card
    if gi.get('record_card_after'):
        total = sum(gi['record_card_after'])
        if gi['record_card_changed']:
            lines.append(
                f"The Eclectic record card has been refreshed and now stands at {total}."
            )
        else:
            lines.append(
                f"The Eclectic record card stands unchanged at {total}, with the "
                f"per-hole bests still holding firm."
            )

    return '\n'.join(lines).strip() + '\n'


def ordinal(n: int | None) -> str:
    if n is None:
        return ''
    if 10 <= n % 100 <= 20:
        return 'th'
    return {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')


def main():
    if len(sys.argv) < 5 or len(sys.argv) > 6:
        print(__doc__)
        sys.exit(1)
    prior = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
    current = json.loads(Path(sys.argv[2]).read_text(encoding='utf-8'))
    event_name = sys.argv[3]
    out_path = Path(sys.argv[4])
    scorecards_added = None
    if len(sys.argv) == 6 and sys.argv[5].strip():
        try:
            scorecards_added = int(sys.argv[5])
        except ValueError:
            scorecards_added = None

    if scorecards_added is None:
        scorecards_added = compute_event_scorecard_count(
            prior.get('goy', {}), current.get('goy', {}))

    deltas = {
        'event_name': event_name,
        'scorecards_added': scorecards_added,
        'goy': compute_goy_deltas(prior['goy'], current['goy']),
        'gross': compute_eclectic_deltas(prior['gross'], current['gross'], 'gross'),
        'nett': compute_eclectic_deltas(prior['nett'], current['nett'], 'nett'),
        'gross_insights': compute_insights_deltas(
            prior['gross_insights'], current['gross_insights']),
        'nett_insights': compute_insights_deltas(
            prior['nett_insights'], current['nett_insights']),
    }

    deltas_path = out_path.with_suffix('.deltas.json')
    deltas_path.write_text(json.dumps(deltas, indent=2, ensure_ascii=False,
                                       default=str),
                            encoding='utf-8')

    newsletter = render_newsletter(event_name, deltas)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(newsletter, encoding='utf-8')

    print(f'\n=== Newsletter draft saved to {out_path} ===')
    print(f'=== Deltas saved to {deltas_path} ===\n')
    print(newsletter)


if __name__ == '__main__':
    main()
