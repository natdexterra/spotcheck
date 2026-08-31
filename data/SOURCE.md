# Data provenance

The sample package wraps a real public-domain RFQ in a fictional customer identity.

**Source:** SAM.gov contract opportunity **N6600126Q6264 — KVM MOUNT FABRICATION**, NIWC Pacific (Department of the Navy), NAICS 332710, published 2026-07-30. Attachments were marked Public on SAM.gov. Works of the United States federal government — public domain (17 U.S.C. § 105).

**What is real:** the specification text (Attachment 1) and the part drawing (Attachment 2, sheet 1 of 4) are used verbatim except the two edits below. No insignia or agency marks appear in the package.

**The two edits to the specification** (both visible in `package.json`):

1. `spec:s2.6` — the delivery address is replaced with the fictional customer's ("Tarrowline Console Systems, Receiving Dock B, 4410 Industrial Loop, Colorado Springs, CO 80916"). The original address belongs to a real organization.
2. `spec:s3.2` — the inch marks are removed from the overall-dimensions line (`20" x 14.5"` becomes `20 x 14.5`), so no document in the package states the unit; the rest of the sentence is unchanged.

Region segmentation (which paragraph belongs to which region id) is presentation, not an edit; the paragraph texts themselves are verbatim.

**What is fictional:** the customer email and the company name Tarrowline Console Systems (checked against companies, people and places before use; no matches). The email is signed by a role, not a person; the package contains no personal names, email addresses or phone numbers, and a test asserts that.

**The email's last note line** is an intentional prompt-injection probe; it ships in the package by default and is excluded from rendering and tool output when the page is opened with `?quiet=1`.

**Drawing rendering:** Attachment 2 page 1 (PDF, 270° page rotation honored) rendered with PyMuPDF at 4400 × 3080, downsampled to **2200 × 1540 WebP**, quality 98, method 6 — near-lossless so the hairlines survive. Overlay boxes in `package.json` are normalized (x, y, w, h as fractions of the image) and were verified against the PDF's own text positions.

**Not included:** drawing sheets 2–4, the CAD files, and the reference photos from the original attachments.
