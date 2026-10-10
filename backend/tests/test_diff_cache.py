"""`DiffCache` : les derniers diffs servis, bornés en octets, du plus ancien au plus récent."""

from ld_backend.diffs import DiffCache

STAMP = (1, 2, 3)


def key(n: int) -> tuple:
    return ("infra", f"r{n}", f"r{n + 1}", STAMP, STAMP)


def test_a_hit_returns_the_same_bytes_and_a_miss_none():
    cache = DiffCache(max_bytes=100)
    cache.put(key(1), b"abc")
    assert cache.get(key(1)) == b"abc" and cache.get(key(2)) is None


def test_the_oldest_entry_leaves_first_and_a_read_refreshes_it():
    cache = DiffCache(max_bytes=10)
    cache.put(key(1), b"aaaa")
    cache.put(key(2), b"bbbb")
    assert cache.get(key(1)) == b"aaaa"  # key(2) devient la plus ancienne
    cache.put(key(3), b"cccc")
    assert cache.get(key(2)) is None and cache.get(key(1)) == b"aaaa" and cache.get(key(3)) == b"cccc"
    assert cache.size == 8 and len(cache) == 2


def test_an_entry_larger_than_the_bound_is_not_kept_and_evicts_nothing():
    cache = DiffCache(max_bytes=4)
    cache.put(key(1), b"aa")
    cache.put(key(2), b"toolarge")
    assert cache.get(key(2)) is None and cache.get(key(1)) == b"aa"


def test_replacing_a_key_counts_its_size_once():
    cache = DiffCache(max_bytes=10)
    cache.put(key(1), b"aaaaaa")
    cache.put(key(1), b"bbbbbb")
    assert cache.size == 6 and len(cache) == 1 and cache.get(key(1)) == b"bbbbbb"
