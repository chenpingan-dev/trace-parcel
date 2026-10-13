# Processing policy

Trace Parcel reconstructs its outputs from an explicit schema. It never copies a raw HAR entry wholesale into an export. `src/core.ts` is shared by the browser and CLI.

| Surface | Default | With Keep JSON bodies |
| --- | --- | --- |
| URL username, password, fragment | Removed | Same |
| Hostname and port | Stable `host-N.invalid` alias; can be disabled | Same |
| URL path | Retained with literal/email/Bearer/JWT rules; encoded separators remain encoded | Same |
| Query values | All replaced; duplicate keys preserved | Same |
| Headers | Values replaced, except recognized Content-Type media types; names retained with text rules | Same |
| Cookie objects | Removed | Same |
| Request and response bodies | Omitted | JSON key/text rules; all other body types omitted |
| Sensitive JSON keys | Not exported | Normalized keys containing token/password/passwd/secret/authorization/credential/session/cookie/email/phone/address/cardnumber/creditcard/ssn/apikey/privatekey have their whole value replaced |
| Raw dates | Replaced with an epoch starting at 2000-01-01, preserving capture-relative offsets | Same |
| IP, connection IDs, comments, page titles, browser metadata, extensions | Not exported | Same |
| Report title and written notes | Text patterns and custom literal rules | Same |

The original HTTP version is retained when recognized; unrecognized versions and status descriptions are omitted. Request method, response status, recorded total time, response size and standard HAR timings are retained. Missing send/wait/receive timing fields are represented as zero for the HAR shape; unknown optional timings use `-1`. No request is replayed or executed.

Text patterns identify conventional email addresses, Bearer values and JWT-shaped tokens. They do **not** infer names, arbitrary identifiers, free-form personal information, every token format, secrets encoded inside values, or relationships between fields. Custom literal values are case-sensitive, 3–512 characters each, at most 100. JSON bodies above 2 MiB or deeper than 60 levels are omitted. Literal rules also apply to numeric JSON values by matching their string representation.

Redaction counts are processing events, **not counts of detected secrets**. A benign header may be removed; one location may match more than one rule. Location receipts contain only entry indices, fixed field locations and reason codes, never original values. The broad removal of extra metadata is documented but is not included in these event counts.

The HTML export contains escaped, processed content and no scripts or original payload. HAR and Markdown use the same parcel snapshot. Preview displays processed content by default. The Original tab deliberately displays source values on your screen; do not take a screenshot of that tab for public sharing.

Imported files, notes and rules are held in tab memory. Only the selected language is stored in localStorage. Clearing a recording or closing the tab releases application references; this is not a secure memory erasure guarantee. The offline workspace and report load no remote assets. The online workspace itself is downloaded from GitHub Pages; GitHub handles that page request. A restrictive CSP blocks application fetches, but browser extensions remain outside this tool's control.

Review retained paths, business fields and notes before sending any exported file. The tool does not claim complete anonymization.
