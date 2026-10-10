import unittest

from pramaan import check, claims, llm, sources


class Claims(unittest.TestCase):
    def test_units_and_money_words(self):
        got = {(n["value"], n["unit"]) for n in claims.numbers("Fine of ₹10,000 or Rs 7 lakh, rate 7.1% and 140 mg/dL")}
        self.assertEqual(got, {(10000, "₹"), (700000, "₹"), (7.1, "%"), (140, "mg/dL")})

    def test_range_inherits_unit(self):
        n = claims.numbers("Normal is 70-100 mg/dL when fasting")
        self.assertEqual([(x["value"], x["unit"]) for x in n], [(70, "mg/dL"), (100, "mg/dL")])
        self.assertEqual(n[0]["range_with"], 100)

    def test_years_are_not_quantities(self):
        self.assertEqual(claims.numbers("In 2024 the rule changed"), [])

    def test_key_claim_prefers_relevant_sentence(self):
        text = "Blood pressure should be 120/80 mmHg. After a meal, blood sugar should be below 140 mg/dL."
        k = claims.extract(text, "What is the normal blood sugar after a meal?")["key"]
        self.assertEqual((k["value"], k["unit"]), (140, "mg/dL"))

    def test_per_quantity_in_question_wins(self):
        text = "Gold is approximately ₹13,925 per gram, which amounts to ₹1,39,250 for 10 grams."
        k = claims.extract(text, "What is the price of 24 carat gold per 10 grams in India today?")["key"]
        self.assertEqual(k["value"], 139250)

    def test_expected_unit(self):
        self.assertEqual(claims.expected_unit("What is the current PPF interest rate?"), "%")
        self.assertEqual(claims.expected_unit("What is the fine for drunk driving?"), "₹")
        self.assertEqual(claims.expected_unit("How many weeks of maternity leave?"), "weeks")


class Verdict(unittest.TestCase):
    def ans(self, label, value, unit="%"):
        return {"label": label, "status": "ok", "claim": {"value": value, "unit": unit}}

    def test_split_and_official_match(self):
        a = [self.ans("A", 7.1), self.ans("B", 7.1), self.ans("C", 8.2)]
        v = check.verdict(a, [{"value": 7.1, "unit": "%", "values": [7.1], "snippet": "The rate is 7.1% a year."}])
        self.assertEqual(v["code"], "split")
        self.assertEqual([x["match"] for x in a], ["matches_official", "matches_official", "differs"])

    def test_range_and_bound_agree(self):
        a = [self.ans("A", 100, "mg/dL"), {"label": "B", "status": "ok",
                                            "claim": {"value": 70, "unit": "mg/dL", "range_with": 100}}]
        self.assertEqual(check.verdict(a, [])["code"], "consensus")

    def test_conflict_dates_say_which_is_stale(self):
        a = [self.ans("A", 5.5), self.ans("B", 5.5)]
        for x in a:
            x["claim"]["date"] = "2026-10-07"
        v = check.verdict(a, [{"value": 5.25, "unit": "%", "values": [5.25], "date": "2026-08-05", "snippet": "Repo rate kept at 5.25 per cent."}])
        self.assertEqual(v["code"], "consensus_conflict")
        self.assertIn("probably outdated", v["note"])

    def test_latest_date(self):
        self.assertEqual(claims.latest_date("raised on October 7, 2026 from 5.25% set on 5 Aug 2026")[0], "2026-10-07")
        self.assertEqual(claims.latest_date("under the Motor Vehicles (Amendment) Act, 2019")[0], "2019-01-01")


class Guards(unittest.TestCase):
    def test_llm_quote_must_exist_and_contain_value(self):
        text = "The PPF rate is 7.1% per annum."
        self.assertTrue(llm.verified({"value": 7.1, "quote": "PPF rate is 7.1%"}, text))
        self.assertFalse(llm.verified({"value": 7.5, "quote": "PPF rate is 7.1%"}, text))  # wrong number
        self.assertFalse(llm.verified({"value": 7.1, "quote": "rate is 7.1% today"}, text))  # invented quote

    def test_source_kinds(self):
        self.assertEqual(sources.kind("https://www.rbi.org.in/x"), "official")
        self.assertEqual(sources.kind("https://pib.gov.in/x"), "official")
        self.assertEqual(sources.kind("https://www.apollohospitals.com/x"), "commercial")
        self.assertEqual(sources.kind("https://www.reddit.com/r/india"), "forum")


if __name__ == "__main__":
    unittest.main()
