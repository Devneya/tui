import struct
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from native_inventory import inventory, pe_imports


def pe_fixture():
    data = bytearray(2048)
    data[:2] = b'MZ'
    struct.pack_into('<I', data, 0x3c, 0x80)
    data[0x80:0x84] = b'PE\0\0'
    struct.pack_into('<HH', data, 0x84, 0x8664, 1)
    struct.pack_into('<H', data, 0x94, 0xf0)
    optional = 0x98
    struct.pack_into('<H', data, optional, 0x20b)
    struct.pack_into('<Q', data, optional+24, 0x140000000)
    struct.pack_into('<II', data, optional+112+8, 0x1000, 40)
    struct.pack_into('<II', data, optional+112+13*8, 0x1040, 64)
    struct.pack_into('<IIII', data, optional+0xf0+8, 0x400, 0x1000, 0x400, 0x400)
    struct.pack_into('<IIIII', data, 0x400, 0, 0, 0, 0x1080, 0)
    struct.pack_into('<IIIIIIII', data, 0x440, 1, 0x1090, 0, 0, 0, 0, 0, 0)
    data[0x480:0x48d] = b'KERNEL32.dll\0'
    data[0x490:0x4a1] = b'VCRUNTIME140.dll\0'
    return data


class NativeInventory(unittest.TestCase):
    def test_normal_and_delayed_imports_are_inventoried(self):
        with tempfile.TemporaryDirectory() as tmp:
            file = Path(tmp)/'node.exe'
            file.write_bytes(pe_fixture())
            self.assertEqual(pe_imports(file), (0x8664, ['kernel32.dll', 'vcruntime140.dll']))

    def test_installed_visual_cpp_runtime_is_not_assumed_to_be_an_os_library(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root/'node.exe').write_bytes(pe_fixture())
            with self.assertRaisesRegex(ValueError, r'Unbundled libraries.*node\.exe: vcruntime140\.dll'):
                inventory(root, 'windows-x64')

    def test_truncated_or_invalid_pe_fails_instead_of_claiming_qualification(self):
        with tempfile.TemporaryDirectory() as tmp:
            file = Path(tmp)/'broken.exe'
            file.write_bytes(b'MZ')
            with self.assertRaisesRegex(ValueError, 'Truncated PE'):
                pe_imports(file)


if __name__ == '__main__':
    unittest.main()
