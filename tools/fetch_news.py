#!/usr/bin/env python3
"""Copy the latest news of the REALISE and REALI3SE websites into data/news.js.

Usage, from the site folder:  python tools/fetch_news.py

GitHub runs this every morning (.github/workflows/news.yml) and commits
data/news.js when something changed. It reads the RSS feeds that WordPress
publishes for both sites and uses only the Python standard library.
If a feed cannot be read, the items already in data/news.js for that site
are kept, so a website being down never empties the list.
"""
import html
import json
import sys
import urllib.request
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime
from pathlib import Path
from zoneinfo import ZoneInfo

FEEDS = {
    'REALISE': 'https://realise-dn.eu/feed/',
    'REALI3SE': 'https://reali3se.eu/feed/',
}
KEEP = 8                      # items stored; script.js shows the first NEWS_SHOWN
TIMEZONE = ZoneInfo('Europe/Rome')
OUT = Path(__file__).resolve().parent.parent / 'data' / 'news.js'

HEADER = """/* Latest news from realise-dn.eu and reali3se.eu, newest first.
   Written by tools/fetch_news.py, which GitHub runs every morning
   (.github/workflows/news.yml). Edits by hand are replaced at the next run. */
"""


def read_feed(project, url):
    request = urllib.request.Request(url, headers={'User-Agent': 'mauriziopetrelli.info news'})
    with urllib.request.urlopen(request, timeout=30) as response:
        root = ET.fromstring(response.read())
    items = []
    for item in root.iter('item'):
        title = html.unescape((item.findtext('title') or '').strip())
        link = (item.findtext('link') or '').strip()
        published = parsedate_to_datetime(item.findtext('pubDate'))
        if title and link.startswith('https://'):
            items.append({
                'date': published.astimezone(TIMEZONE).date().isoformat(),
                'project': project,
                'title': title,
                'url': link,
            })
    return items


def previous_items():
    if not OUT.exists():
        return []
    text = OUT.read_text(encoding='utf-8')
    return json.loads(text[text.index('['):text.rindex(']') + 1])


def main():
    old = previous_items()
    items = []
    for project, url in FEEDS.items():
        try:
            items += read_feed(project, url)
        except Exception as error:  # network or feed problem: keep what we had
            print(f'{project}: {error}; keeping the previous items', file=sys.stderr)
            items += [item for item in old if item['project'] == project]
    items.sort(key=lambda item: (item['date'], item['title']), reverse=True)
    lines = ',\n'.join('  ' + json.dumps(item, ensure_ascii=False) for item in items[:KEEP])
    OUT.write_text(HEADER + 'const PROJECT_NEWS = [\n' + lines + '\n];\n', encoding='utf-8')
    print(f'{OUT.name}: {min(len(items), KEEP)} items')


if __name__ == '__main__':
    main()
