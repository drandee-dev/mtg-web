"""Self-check for AI cost accounting. Run: python test_usage_pricing.py

This is the money path: it decides when the monthly budget cap trips. Each case
below is a way the old two-constant version got the number wrong.
"""
import sys

sys.path.insert(0, ".")
from app import usage  # noqa: E402


class U:
    """Stands in for the SDK usage object."""

    def __init__(self, inp, out, read=0, write=0):
        self.input_tokens = inp
        self.output_tokens = out
        self.cache_read_input_tokens = read
        self.cache_creation_input_tokens = write


def test_priced_per_model():
    # 1M in + 1M out at Sonnet 5's $2/$10.
    assert usage.cost_cents("claude-sonnet-5", U(1_000_000, 1_000_000)) == 1200

    # The fallback model is a third of the price. The old code billed this at
    # Sonnet's rate, overstating every fallback response threefold.
    haiku = usage.cost_cents("claude-haiku-4-5", U(1_000_000, 1_000_000))
    sonnet = usage.cost_cents("claude-sonnet-5", U(1_000_000, 1_000_000))
    assert haiku == 600, haiku
    assert haiku < sonnet, (haiku, sonnet)
    print("ok: each model is billed at its own rate")


def test_cached_tokens_are_billed():
    """Anthropic reports cache reads/writes outside input_tokens."""
    # A deck call whose 5,600-token payload was served from cache.
    cached = usage.cost_cents("claude-sonnet-5", U(200, 500, read=5600))
    uncached = usage.cost_cents("claude-sonnet-5", U(200, 500))
    assert cached > uncached, "cached tokens must cost something, not nothing"

    # Reads are a tenth of the input rate, writes a 1.25x premium.
    read_only = usage.cost_cents("claude-sonnet-5", U(0, 0, read=1_000_000))
    write_only = usage.cost_cents("claude-sonnet-5", U(0, 0, write=1_000_000))
    assert read_only == 20, read_only        # 200 * 0.1
    assert write_only == 250, write_only     # 200 * 1.25
    assert write_only > read_only * 10
    print("ok: cache reads and writes are billed, at their own multipliers")


def test_unknown_model_does_not_bill_zero():
    """A typo must overstate the bill, never hide it."""
    unknown = usage.cost_cents("claude-sonnet-9-typo", U(1_000_000, 1_000_000))
    assert unknown > 0
    assert unknown >= usage.cost_cents("claude-opus-5", U(1_000_000, 1_000_000))
    print("ok: an unknown model bills at the highest known rate")


def test_missing_cache_fields_do_not_crash():
    """Older SDK responses, and the Haiku path, may omit the cache fields."""

    class Bare:
        input_tokens = 100
        output_tokens = 50

    assert usage.cost_cents("claude-sonnet-5", Bare()) > 0
    print("ok: a usage object without cache fields still prices")


if __name__ == "__main__":
    test_priced_per_model()
    test_cached_tokens_are_billed()
    test_unknown_model_does_not_bill_zero()
    test_missing_cache_fields_do_not_crash()
    print("\nall passed")
