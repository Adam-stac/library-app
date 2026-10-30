"""Names each failed API test as a GitHub annotation, so a failure shows on the pull request (and through the API)
without opening the job's log. Reads the JUnit reports that Maven's test runners write; prints nothing when all pass.
Messages are cut short, and only the first lines of each stack trace are kept."""

import glob
import sys
import xml.etree.ElementTree as ET


def escape(text: str) -> str:
    """GitHub's annotation format: %, CR and LF must be escaped."""
    return text.replace('%', '%25').replace('\r', '%0D').replace('\n', '%0A')


failed = 0
for path in sorted(glob.glob('target/surefire-reports/TEST-*.xml') + glob.glob('target/failsafe-reports/TEST-*.xml')):
    for case in ET.parse(path).getroot().iter('testcase'):
        for problem in list(case.findall('failure')) + list(case.findall('error')):
            failed += 1
            name = f"{case.get('classname', '').rsplit('.', 1)[-1]}.{case.get('name', '')}"
            lines = (problem.get('message') or '').strip().splitlines()[:12]
            trace = [line for line in (problem.text or '').splitlines() if 'libraryapp' in line][:6]
            detail = '\n'.join(lines + ['', *trace])[:3000]
            print(f'::error title={escape(name)}::{escape(detail)}')
print(f'{failed} failed test(s) named', file=sys.stderr)
