"""Builds the scholars and works snapshot from Wikidata (CC0) that the API loads as reference data (ADR 0010).

Run it from the repository root when the snapshot should be refreshed:

    python3 tools/wikidata/scholars_snapshot.py

It asks Wikidata's query service for every person linked to OpenITI (P13870) or al-Maktaba al-Shamela (P12435), and
the works whose author (P50) is one of them, leaving out the few people in LEFT_OUT. It writes
apps/api/src/main/resources/reference/wikidata-scholars.json.gz and prints the file's SHA-256, which must then be
copied into WikidataScholars.java: the API refuses a snapshot whose checksum isn't the one in the code. After a change
to LEFT_OUT alone, `--left-out-only` applies it to the snapshot already in the repository without asking Wikidata. Everything is
re-checked when the API loads it. The query service sometimes allows one query a minute; the script waits.
"""

import datetime
import gzip
import hashlib
import json
import pathlib
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ENDPOINT = 'https://query.wikidata.org/sparql'
USER_AGENT = 'Khizana-reference-snapshot/1 (https://github.com/Adam-stac/library-app)'
OUT = pathlib.Path('apps/api/src/main/resources/reference/wikidata-scholars.json.gz')

# Non-Muslim Western writers whose books al-Maktaba al-Shamela carries in Arabic translation. The timelines are of
# Muslim scholars, so they are left out (Adam's decision, 30 October 2026). Found by asking Wikidata for every linked
# person with a citizenship in Europe, the Americas or Oceania and no Islamic religion, then read one by one: the
# rest of that list were Muslims of the Umayyad and Ottoman states and al-Andalus, kept. Arab Christian and medieval
# Jewish writers of the Islamic world aren't Western and stay. A work left with none of its authors goes too.
LEFT_OUT = {
    'Q71564': 'Sigrid Hunke',
    'Q282523': 'Mario Pei',
    'Q333911': 'Will Durant',
    'Q708843': 'Reinhart Dozy',
    'Q979086': 'Joseph Vendryes',
    'Q1386146': 'Albert Hourani',
    'Q5621562': 'Gustavus Hindman Miller',
}

SCHOLARS = '''
SELECT ?a ?ar ?en ?time ?precision WHERE {
  { ?a wdt:P13870 [] } UNION { ?a wdt:P12435 [] }
  OPTIONAL { ?a rdfs:label ?ar . FILTER(LANG(?ar) = "ar") }
  OPTIONAL { ?a rdfs:label ?en . FILTER(LANG(?en) = "en") }
  OPTIONAL { ?a p:P570 ?death . ?death wikibase:rank ?rank . FILTER(?rank != wikibase:DeprecatedRank)
             ?death psv:P570 [ wikibase:timeValue ?time ; wikibase:timePrecision ?precision ] }
}'''

WORKS = '''
SELECT ?w ?a ?ar ?en ?ordinal ?whole WHERE {
  { ?a wdt:P13870 [] } UNION { ?a wdt:P12435 [] }
  ?w p:P50 ?statement . ?statement ps:P50 ?a .
  OPTIONAL { ?statement pq:P1545 ?ordinal }
  ?w rdfs:label ?ar . FILTER(LANG(?ar) = "ar")
  OPTIONAL { ?w rdfs:label ?en . FILTER(LANG(?en) = "en") }
  # Works only: not a printed edition or translation of another work, and not a single poem, a newspaper or a web
  # page. What a work is part of comes back too: a part of another work by the same author is left out below
  FILTER NOT EXISTS { ?w wdt:P629 [] }
  OPTIONAL { ?w wdt:P361 ?whole }
  FILTER NOT EXISTS { ?w wdt:P31 ?kind .
    VALUES ?kind { wd:Q3331189 wd:Q57933693 wd:Q5185279 wd:Q572371 wd:Q1661 wd:Q1238720 wd:Q28869365 wd:Q11032 wd:Q36774 } }
  FILTER NOT EXISTS { ?w wdt:P7937 ?form . VALUES ?form { wd:Q5185279 wd:Q572371 wd:Q1661 } }
}'''


def ask(sparql):
    url = ENDPOINT + '?format=json&query=' + urllib.parse.quote(sparql)
    request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT, 'Accept': 'application/sparql-results+json'})
    for _ in range(30):
        try:
            with urllib.request.urlopen(request, timeout=300) as response:
                return json.load(response)['results']['bindings']
        except urllib.error.HTTPError as error:
            if error.code not in (429, 503, 504):
                raise
            print(f'Wikidata answered {error.code}; waiting a minute', file=sys.stderr)
            time.sleep(70)
    raise SystemExit('Wikidata kept refusing; try again later')


# Invisible characters that only steer how text is drawn: a byte order mark, and direction marks and isolates
INVISIBLE = dict.fromkeys(map(ord, '\ufeff\u200e\u200f\u202a\u202b\u202c\u202d\u202e\u2066\u2067\u2068\u2069'))


def clean(text):
    return ' '.join(text.translate(INVISIBLE).split()) or None if text else None


def qid(uri):
    return uri.rsplit('/', 1)[-1]


def hijri_year(year, month, day):
    """The Hijri year of a Gregorian date, by the tabular (civil) Islamic calendar: right to the year, give or take a
    day at the year's edge, which is the precision the app keeps."""
    a = (14 - month) // 12
    y = year + 4800 - a
    m = month + 12 * a - 3
    julian_day = day + (153 * m + 2) // 5 + 365 * y + y // 4 - y // 100 + y // 400 - 32045
    days = julian_day - 1948440 + 10632
    cycles = (days - 1) // 10631
    days = days - 10631 * cycles + 354
    j = ((10985 - days) // 5316) * ((50 * days) // 17719) + (days // 5670) * ((43 * days) // 15238)
    days = days - ((30 - j) // 15) * ((17719 * j) // 50) - (j // 16) * ((15238 * j) // 43) + 29
    return 30 * cycles + j - 30


def death(time_value, precision):
    """(CE year, Hijri year, approximate) from a Wikidata time. A year alone falls across two Hijri years, so only a
    date to the month or day gives the Hijri year; a decade or century is too vague to keep."""
    sign = -1 if time_value.startswith('-') else 1
    year, month, day = (int(part) for part in time_value.lstrip('+-').split('T')[0].split('-'))
    year *= sign
    precision = int(precision)
    if precision < 9 or year == 0 or not -1500 <= year <= 2100:
        return None
    hijri = hijri_year(year, month, day) if precision >= 10 and year >= 622 else None
    return year, hijri if hijri and 1 <= hijri <= 1500 else None, False


def leave_out(snapshot):
    """The snapshot without the people in LEFT_OUT, and without any work that then has no author."""
    scholars = [s for s in snapshot['scholars'] if s['id'] not in LEFT_OUT]
    works = []
    for work in snapshot['works']:
        authors = [a for a in work['authors'] if a not in LEFT_OUT]
        if authors:
            works.append({**work, 'authors': authors})
    selection = 'People with an OpenITI author ID (P13870) or a Shamela author ID (P12435), and their works (P50)'
    selection += f', except {len(LEFT_OUT)} non-Muslim Western writers'
    return {**snapshot, 'selection': selection, 'scholars': scholars, 'works': works}


def write(snapshot):
    data = json.dumps(snapshot, ensure_ascii=False, separators=(',', ':'), sort_keys=True).encode('utf-8')
    OUT.parent.mkdir(parents=True, exist_ok=True)
    # mtime=0 keeps the file the same for the same data, so its checksum only changes when the data does
    OUT.write_bytes(gzip.compress(data, compresslevel=9, mtime=0))
    print(f"{len(snapshot['scholars'])} scholars, {len(snapshot['works'])} works -> {OUT} ({OUT.stat().st_size} bytes)")
    print('SHA-256', hashlib.sha256(OUT.read_bytes()).hexdigest())


def main():
    if sys.argv[1:] == ['--left-out-only']:
        write(leave_out(json.loads(gzip.decompress(OUT.read_bytes()))))
        return
    scholars = {}
    for row in ask(SCHOLARS):
        entry = scholars.setdefault(qid(row['a']['value']), {'ar': None, 'en': None, 'deaths': set()})
        entry['ar'] = entry['ar'] or clean(row.get('ar', {}).get('value'))
        entry['en'] = entry['en'] or clean(row.get('en', {}).get('value'))
        if 'time' in row:
            found = death(row['time']['value'], row['precision']['value'])
            if found:
                entry['deaths'].add(found)
    time.sleep(70)  # the query service may allow one query a minute
    works = {}
    for row in ask(WORKS):
        entry = works.setdefault(qid(row['w']['value']), {'ar': clean(row['ar']['value']), 'en': None, 'authors': {}})
        entry['en'] = entry['en'] or clean(row.get('en', {}).get('value'))
        ordinal = row.get('ordinal', {}).get('value', '')
        entry['authors'][qid(row['a']['value'])] = int(ordinal) if ordinal.isdigit() else 999
        if 'whole' in row:
            entry.setdefault('wholes', set()).add(qid(row['whole']['value']))

    # A part of another work by one of the same authors (a poem in the poet's diwan, one volume of an author's
    # collected works) is that work's, not a work of its own. Sahih al-Bukhari, part of the six books, which no one
    # of its authors wrote, stays.
    for key in list(works):
        entry = works[key]
        if any(whole in works and set(works[whole]['authors']) & set(entry['authors']) for whole in entry.get('wholes', ())):
            del works[key]

    out_scholars = []
    for key in sorted(scholars, key=lambda q: int(q[1:])):
        entry = scholars[key]
        if not entry['ar'] and not entry['en']:
            continue
        # Two different death dates on Wikidata: keep none rather than guess which is right
        deaths = entry['deaths']
        ce, hijri, approximate = next(iter(deaths)) if len({d[0] for d in deaths}) == 1 else (None, None, False)
        out_scholars.append({'id': key, 'ar': entry['ar'], 'en': entry['en'], 'deathCe': ce, 'deathHijri': hijri})
    known = {s['id'] for s in out_scholars}
    out_works = []
    for key in sorted(works, key=lambda q: int(q[1:])):
        entry = works[key]
        authors = [a for a, _ in sorted(entry['authors'].items(), key=lambda item: (item[1], int(item[0][1:]))) if a in known]
        if authors and entry['ar']:
            out_works.append({'id': key, 'ar': entry['ar'], 'en': entry['en'], 'authors': authors[:20]})

    snapshot = leave_out({
        'source': 'Wikidata (https://www.wikidata.org)',
        'licence': 'CC0 1.0 Universal (public domain dedication)',
        'retrieved': datetime.date.today().isoformat(),
        'selection': 'People with an OpenITI author ID (P13870) or a Shamela author ID (P12435), and their works (P50)',
        'scholars': out_scholars,
        'works': out_works,
    })
    write(snapshot)
    out_scholars, out_works = snapshot['scholars'], snapshot['works']
    # A check by eye: a poet with thousands of "works" means single poems got through
    names = {s['id']: s['ar'] or s['en'] for s in out_scholars}
    counts = {}
    for work in out_works:
        for author in work['authors']:
            counts[author] = counts.get(author, 0) + 1
    print('Most works:', ', '.join(f'{names[a]} {n}' for a, n in sorted(counts.items(), key=lambda i: -i[1])[:10]))


if __name__ == '__main__':
    main()
