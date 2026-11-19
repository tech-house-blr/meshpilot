import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from connectors.tailscale import parse  # noqa: E402

STATUS = {
    "Self": {"ID": "s1", "UserID": 1, "DNSName": "atlas.tn.ts.net.", "OS": "linux", "TailscaleIPs": ["100.1.1.1"], "Online": True},
    "User": {"1": {"LoginName": "me@x.com"}, "2": {"LoginName": "other@x.com"}},
    "Peer": {
        "a": {"ID": "a", "UserID": 1, "DNSName": "win.tn.ts.net.", "OS": "windows", "TailscaleIPs": ["100.1.1.2"], "Online": False, "LastSeen": "0001-01-01T00:00:00Z"},
        "b": {"ID": "b", "UserID": 2, "DNSName": "pi.other.ts.net.", "OS": "Linux", "TailscaleIPs": ["100.1.1.3"], "Online": True},
        "c": {"ID": "c", "UserID": 1, "DNSName": "phone.tn.ts.net.", "OS": "android", "TailscaleIPs": ["100.1.1.4"], "Online": True},
    },
}


class ParseTest(unittest.TestCase):
    def setUp(self):
        self.m = {x.name: x for x in parse(STATUS)}

    def test_owner_decides_control(self):
        self.assertTrue(self.m["phone"].public()["controllable"])
        self.assertFalse(self.m["pi"].public()["controllable"])   # shared by someone else
        self.assertFalse(self.m["win"].public()["controllable"])  # owned but offline

    def test_self_first_and_online_before_offline(self):
        self.assertEqual([x.name for x in parse(STATUS)][0], "atlas")
        self.assertEqual([x.name for x in parse(STATUS)][-1], "win")

    def test_normalisation(self):
        self.assertEqual(self.m["pi"].os, "linux")
        self.assertEqual(self.m["win"].last_seen, "")
        self.assertEqual(self.m["pi"].owner, "other@x.com")

    def test_empty_status(self):
        self.assertEqual(parse({}), [])


if __name__ == "__main__":
    unittest.main()
