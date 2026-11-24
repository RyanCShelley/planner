from datetime import date

from api.index import next_due

FRI = date(2026, 11, 27)  # a Friday


def test_simple_intervals():
    assert next_due("daily", None, FRI) == date(2026, 11, 28)
    assert next_due("weekly", None, FRI) == date(2026, 12, 4)
    assert next_due("biweekly", None, FRI) == date(2026, 12, 11)
    assert next_due("never", None, FRI) is None


def test_weekdays_skip_weekend():
    assert next_due("weekdays", None, FRI) == date(2026, 11, 30)  # Monday


def test_monthly_clamps_short_months():
    assert next_due("monthly", None, date(2026, 1, 31)) == date(2026, 2, 28)
    assert next_due("monthly", None, date(2026, 12, 15)) == date(2027, 1, 15)


def test_specific_days_mon_wed_fri():
    mwf = [1, 3, 5]
    assert next_due("days", mwf, FRI) == date(2026, 11, 30)  # Fri -> Mon
    assert next_due("days", mwf, date(2026, 11, 30)) == date(2026, 12, 2)  # Mon -> Wed
    assert next_due("days", [], FRI) is None
