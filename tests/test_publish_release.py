import contextlib
import io
import json
import os
import runpy
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

SCRIPTS = Path(__file__).resolve().parents[1] / 'scripts'
sys.path.insert(0, str(SCRIPTS))
import release_common


class Publication(unittest.TestCase):
    def exercise(self, *, settings_status=403, published=False, wrong_digest=False):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            assets = root/'release-assets'
            assets.mkdir()
            for name in ['devneya-v0.1.0-linux-x64.tar.gz', 'SHA256SUMS', 'provenance.sigstore.json']:
                (assets/name).write_bytes(name.encode())
            (root/'release-notes.md').write_text('Test release')
            state = {'created': published, 'assets': [], 'mutations': [], 'published': False}

            def command(args, **kwargs):
                argv = args[1:]
                result = SimpleNamespace(returncode=0, stdout='', stderr='')
                if argv[:2] == ['auth', 'status']:
                    return result
                if argv[0] == 'api':
                    endpoint = argv[1]
                    if endpoint.endswith('/immutable-releases'):
                        result.returncode = 1
                        result.stderr = f'gh: Resource not accessible (HTTP {settings_status})'
                    elif '/releases/tags/' in endpoint and not state['created']:
                        result.returncode = 1
                        result.stderr = 'gh: Not Found (HTTP 404)'
                    else:
                        result.stdout = json.dumps({'id': 1, 'draft': not published, 'assets': state['assets']})
                    return result
                self.assertEqual(argv[0], 'release')
                self.assertNotIn('--clobber', argv)
                state['mutations'].append(argv)
                if argv[1] == 'create':
                    state['created'] = True
                elif argv[1] == 'upload':
                    file = Path(argv[3])
                    state['assets'].append({'name': file.name, 'digest': 'sha256:'+('0'*64 if wrong_digest else release_common.sha(file))})
                elif argv[1] == 'edit':
                    self.assertEqual({a['name'] for a in state['assets']}, {p.name for p in assets.iterdir()})
                    state['published'] = True
                else:
                    self.fail('Unexpected publication command')
                return result

            output = io.StringIO()
            with patch.object(release_common, 'ROOT', root), patch.dict(os.environ, RELEASE_TAG='v0.1.0'), patch('subprocess.run', command), patch('time.sleep'), contextlib.redirect_stdout(output):
                try:
                    runpy.run_path(str(SCRIPTS/'publish_release.py'), run_name='__main__')
                except BaseException as error:
                    return state, output.getvalue(), error
            return state, output.getvalue(), None

    def test_contents_token_can_publish_after_settings_api_denies_admin_access(self):
        state, output, error = self.exercise()
        self.assertIsNone(error)
        self.assertTrue(state['published'])
        self.assertIn('No policy value is inferred', output)
        self.assertEqual(state['mutations'][-1][1], 'edit')

    def test_hidden_settings_endpoint_is_reported_without_inventing_policy(self):
        state, output, error = self.exercise(settings_status=404)
        self.assertIsNone(error)
        self.assertTrue(state['published'])
        self.assertIn('pre-tag administrator audit', output)

    def test_unrelated_api_failure_stops_before_release_mutation(self):
        state, _, error = self.exercise(settings_status=500)
        self.assertIsInstance(error, RuntimeError)
        self.assertEqual(state['mutations'], [])

    def test_published_release_is_never_modified(self):
        state, _, error = self.exercise(published=True)
        self.assertIsInstance(error, SystemExit)
        self.assertEqual(state['mutations'], [])

    def test_uploaded_digest_mismatch_keeps_draft_unpublished(self):
        state, _, error = self.exercise(wrong_digest=True)
        self.assertIsInstance(error, SystemExit)
        self.assertFalse(state['published'])
        self.assertFalse(any(a[1] == 'edit' for a in state['mutations']))


if __name__ == '__main__':
    unittest.main()
