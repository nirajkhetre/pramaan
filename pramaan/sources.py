"""Classify where a cited page comes from."""
import re
from urllib.parse import urlparse

OFFICIAL_SUFFIXES = (".gov.in", ".nic.in", ".gov", ".int")
OFFICIAL_HOSTS = {
    "rbi.org.in", "sebi.gov.in", "icmr.gov.in", "who.int", "indiacode.nic.in", "incometaxindia.gov.in",
    "epfindia.gov.in", "uidai.gov.in", "pib.gov.in", "nhm.gov.in", "mohfw.gov.in", "india.gov.in",
    "myscheme.gov.in", "nsiindia.gov.in", "indiapost.gov.in", "morth.nic.in", "parivahan.gov.in",
    "pmjay.gov.in", "nha.gov.in", "mudra.org.in", "lic.in", "sbi.co.in", "nhb.org.in", "nabard.org",
    "iiti.ac.in", "aiims.edu", "cbic.gov.in", "gst.gov.in", "egazette.gov.in",
}
NEWS = {
    "timesofindia.indiatimes.com", "economictimes.indiatimes.com", "indiatimes.com", "thehindu.com",
    "hindustantimes.com", "indianexpress.com", "ndtv.com", "livemint.com", "business-standard.com",
    "moneycontrol.com", "financialexpress.com", "news18.com", "indiatoday.in", "thehindubusinessline.com",
    "deccanherald.com", "theprint.in", "scroll.in", "thequint.com", "zeenews.india.com", "abplive.com",
    "bbc.com", "bbc.co.uk", "reuters.com", "cnbctv18.com", "businesstoday.in", "jagranjosh.com",
    "the-ken.com", "outlookindia.com", "firstpost.com", "newindianexpress.com", "tribuneindia.com",
}
COMMERCIAL = {
    # hospitals, pharmacies, health portals
    "apollohospitals.com", "apollo247.com", "maxhealthcare.in", "fortishealthcare.com", "medanta.org",
    "practo.com", "1mg.com", "pharmeasy.in", "netmeds.com", "manipalhospitals.com", "narayanahealth.org",
    "healthline.com", "webmd.com", "medicalnewstoday.com", "clevelandclinic.org", "mayoclinic.org",
    "tatahealth.com", "redcliffelabs.com", "metropolisindia.com", "lalpathlabs.com", "healthifyme.com",
    "starhealth.in", "carehospitals.com", "kimshospitals.com", "medplusmart.com", "truemeds.in",
    # finance, tax, insurance marketplaces
    "cleartax.in", "bankbazaar.com", "paisabazaar.com", "groww.in", "policybazaar.com", "zerodha.com",
    "taxguru.in", "incometaxindia.co", "tax2win.in", "angelone.in", "5paisa.com", "etmoney.com",
    "acko.com", "coverfox.com", "turtlemint.com", "insurancedekho.com", "cardekho.com", "carwale.com",
    "bajajfinserv.in", "hdfcbank.com", "icicibank.com", "axisbank.com", "kotak.com", "tataaia.com",
    "hdfclife.com", "iciciprulife.com", "maxlifeinsurance.com", "indiafilings.com", "vakilsearch.com",
}
FORUMS = {"reddit.com", "quora.com", "youtube.com", "facebook.com", "instagram.com", "x.com",
          "twitter.com", "linkedin.com", "medium.com", "stackexchange.com", "tiktok.com"}
REFERENCE = {"wikipedia.org", "britannica.com", "byjus.com", "testbook.com", "vedantu.com"}

KINDS = ["official", "news", "commercial", "forum", "reference", "hijacked", "other"]
# Parasite-SEO pages planted on real institutional domains through a vulnerable
# krpano panorama viewer: the URL smuggles in an include from a spam host.
HIJACK = re.compile(r"krpano|[?&]xml=data:|%3Cinclude", re.I)
# Sites not in the lists above, recognised by what their name says they sell.
COMMERCIAL_HINTS = re.compile(
    r"hospital|clinic|diagnost|health|medi|pharm|diabet|care|lab|doctor|ayur|wellness|"
    r"financ|loan|bank|invest|insur|wealth|money|tax|credit|capital|broking|fintech", re.I)


def domain(url):
    host = (urlparse(url or "").hostname or "").lower()
    return host[4:] if host.startswith("www.") else host


def _in(host, names):
    return any(host == n or host.endswith("." + n) for n in names)


def kind(url):
    host = domain(url)
    if not host:
        return "other"
    if HIJACK.search(url):
        return "hijacked"
    if _in(host, OFFICIAL_HOSTS) or host.endswith(OFFICIAL_SUFFIXES):
        return "official"
    if _in(host, NEWS):
        return "news"
    if _in(host, COMMERCIAL):
        return "commercial"
    if _in(host, FORUMS):
        return "forum"
    if _in(host, REFERENCE) or host.endswith((".edu", ".ac.in", ".edu.in")):
        return "reference"
    if COMMERCIAL_HINTS.search(host):
        return "commercial"
    return "other"
