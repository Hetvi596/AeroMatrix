"""Set up a local inference environment, then run or verify. Never trains."""
from pathlib import Path
import hashlib
import os
import subprocess
import sys

ROOT=Path(__file__).resolve().parent

def main():
    if sys.version_info[:2]!=(3,12):
        raise SystemExit('Install Python 3.12 (64-bit), then run the batch file again.')
    environment=ROOT/'.venv'
    executable=environment/('Scripts/python.exe' if os.name=='nt' else 'bin/python')
    if not executable.exists(): subprocess.check_call([sys.executable,'-m','venv',str(environment)])
    requirements=ROOT/'requirements.txt';digest=hashlib.sha256(requirements.read_bytes()).hexdigest()
    marker=environment/'aeromatrix-requirements.sha256'
    if not marker.exists() or marker.read_text()!=digest:
        subprocess.check_call([str(executable),'-m','pip','install','--disable-pip-version-check','-r',str(requirements)],cwd=ROOT)
        marker.write_text(digest)
    os.environ.pop('PYTHONPATH',None)
    os.environ.setdefault('PYTHONWARNINGS','ignore::DeprecationWarning')
    os.environ['PYTHONIOENCODING']='utf-8'
    target=[str(ROOT/'verify_export.py')] if len(sys.argv)>1 and sys.argv[1]=='test' else ['-m','api.main']
    raise SystemExit(subprocess.call([str(executable),*target],cwd=ROOT))

if __name__=='__main__': main()
