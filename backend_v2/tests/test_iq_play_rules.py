"""Pure game rules regression tests; do not connect to production database."""
from iq_play import level_for, seconds_for


def test_question_time_bands():
    assert [seconds_for(i) for i in range(15)] == [30]*3 + [25]*6 + [20]*6


def test_level_boundaries():
    assert level_for(0) == 1
    assert level_for(399) == 1
    assert level_for(400) == 2
    assert level_for(133400) == 30
    assert level_for(9999999) == 30
