import hashlib
import json
import re
import sqlite3

class Retriever:
    def __init__(self, root):
        self.root=root
        self.path=root/'rag'/'knowledge_index'/'knowledge.sqlite3'
        self.path.parent.mkdir(parents=True,exist_ok=True)
        self.manifest_path=root/'metadata'/'knowledge_manifest.json'
        self.build()

    def build(self):
        manifest=json.loads(self.manifest_path.read_text(encoding='utf-8')) if self.manifest_path.exists() else {'documents':[]}
        with sqlite3.connect(self.path) as db:
            db.execute('DROP TABLE IF EXISTS chunks')
            db.execute('CREATE VIRTUAL TABLE chunks USING fts5(title,body,source UNINDEXED,section UNINDEXED, tokenize="unicode61")')
            for item in manifest['documents']:
                path=(self.root/'knowledge_base'/item['file']).resolve()
                if not path.is_relative_to((self.root/'knowledge_base').resolve()) or not path.is_file(): continue
                data=path.read_bytes()
                if hashlib.sha256(data).hexdigest()!=item['sha256']: continue
                text=data.decode('utf-8')
                for index, block in enumerate(re.split(r'\n(?=## )', text)):
                    if block.strip():
                        for start in range(0,len(block),2400):
                            db.execute('INSERT INTO chunks VALUES (?,?,?,?)',(item['title'],block[start:start+2600],item['file'],str(index)))

    def search(self, query, limit=4):
        words=re.findall(r'[^\W_]+',query.lower(),re.UNICODE)
        stop={'what','is','the','a','an','how','does','do','it','are','in','of','to','and','explain','please','me','about','which','can','you','my','for'}
        terms=list(dict.fromkeys(w for w in words if w not in stop and len(w)>1))[:30]
        if not terms:return []
        expr=' OR '.join('"'+w.replace('"','')+'"' for w in terms)
        with sqlite3.connect(self.path) as db:
            rows=db.execute('SELECT title,body,source,section,bm25(chunks,2,1) FROM chunks WHERE chunks MATCH ? ORDER BY bm25(chunks,2,1) LIMIT ?', (expr,limit)).fetchall()
        return [{'id':f'KB{i+1}','title':r[0],'text':r[1],'file':r[2],'section':r[3]} for i,r in enumerate(rows)]

    def status(self):
        with sqlite3.connect(self.path) as db:n=db.execute('SELECT count(*) FROM chunks').fetchone()[0]
        return {'available':n>0,'chunks':n,'method':'SQLite FTS5 BM25','integrity':'Only manifest-hash-matching documents are indexed'}
