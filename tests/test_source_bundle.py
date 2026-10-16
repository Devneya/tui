import hashlib
import io
import json
import sys
import tarfile
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'scripts'))
import release_common
from source_bundle import entries


class CorrespondingSources(unittest.TestCase):
    def test_archive_names_digests_and_https_are_required(self):
        row={'name':'library','archive':'library.tar.gz','source':'https://example.test/library','sha256':'a'*64}
        for mutation in [('archive','../escape.tar.gz'),('archive','crates/../escape'),('sha256','bad'),('source','http://example.test/library')]:
            changed={**row,mutation[0]:mutation[1]}
            with self.assertRaises(ValueError):
                entries({'components':[changed],'packagingSource':row,'patches':[],'rustCrates':[]})
        with self.assertRaisesRegex(ValueError,'duplicate'):
            entries({'components':[row],'packagingSource':row,'patches':[],'rustCrates':[]})

    def fixture(self, root, mutation=None):
        source='a'*40
        library=b'original library source';recipe=b'original build recipe'
        index={'components':[{'name':'library','archive':'library.tar.gz','source':'https://example.test/library','sha256':hashlib.sha256(library).hexdigest()}],'packagingSource':{'name':'recipe','archive':'recipe.tar.gz','source':'https://example.test/recipe','sha256':hashlib.sha256(recipe).hexdigest()},'patches':[],'rustCrates':[]}
        directory=root/'third_party';directory.mkdir()
        (directory/'native-sources.json').write_text(json.dumps(index))
        manifest={'schemaVersion':1,'product':'devneya','version':'0.1.0','sourceCommit':source,'releaseEligible':True,'indexSha256':release_common.sha(directory/'native-sources.json')}
        if mutation=='source':manifest['sourceCommit']='b'*40
        if mutation=='candidate':manifest['releaseEligible']=False
        files={'source-manifest.json':json.dumps(manifest).encode(),'archives/library.tar.gz':library,'archives/recipe.tar.gz':recipe,'third_party/native-sources.json':(directory/'native-sources.json').read_bytes()}
        if mutation=='missing':del files['archives/library.tar.gz']
        if mutation=='changed':files['archives/library.tar.gz']=b'replaced source'
        if mutation=='traversal':files['../escape']=b'unsafe'
        archive=root/'sources.tar.gz'
        with tarfile.open(archive,'w:gz') as output:
            for name,data in files.items():
                entry=tarfile.TarInfo(name);entry.size=len(data);output.addfile(entry,io.BytesIO(data))
            if mutation=='duplicate':
                entry=tarfile.TarInfo('archives/library.tar.gz');entry.size=len(library);output.addfile(entry,io.BytesIO(library))
        return archive,source

    def test_complete_pinned_source_bundle_is_accepted(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);archive,source=self.fixture(root)
            with patch.object(release_common,'ROOT',root):
                release_common.validate_source_bundle(archive,source)

    def test_changed_missing_candidate_wrong_source_and_unsafe_entries_fail(self):
        for mutation in ['changed','missing','candidate','source','traversal','duplicate']:
            with self.subTest(mutation=mutation), tempfile.TemporaryDirectory() as tmp:
                root=Path(tmp);archive,source=self.fixture(root,mutation)
                with patch.object(release_common,'ROOT',root), self.assertRaises(AssertionError):
                    release_common.validate_source_bundle(archive,source)


if __name__=='__main__':
    unittest.main()
