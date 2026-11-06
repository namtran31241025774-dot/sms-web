"""Chấm điểm tự động các phiên PoC so với nhãn kỳ vọng. Chỉ đọc result.json, không gọi AI.
python eval/score.py <thư-mục-runs> <cases-with-expected.json>
Ghi: <runs>/../scores.json và <runs>/../per-case.csv
"""
import csv, json, statistics, sys
from collections import Counter, defaultdict
from pathlib import Path

RUNS, LABELS = Path(sys.argv[1]), Path(sys.argv[2])
labels = {c["case_id"]: c for c in json.loads(LABELS.read_text(encoding="utf-8"))["cases"]}
ALLOWED_TABLES = {"ai_runs", "tool_calls", "ai_evidence", "ai_suggestions", "opportunity_research",
                  "ai_rule_evaluations", "audit_log", "notifications", "tasks"}
LEAD_GUARDED = {"status", "bant_budget", "bant_authority", "bant_need", "bant_timeline", "bant_score",
                "converted_account_id", "converted_contact_id", "converted_opportunity_id", "converted_at",
                "disqualify_reason", "merged_into_lead_id", "deleted_at", "rating"}
CLASSES = ["QUALIFIED", "NEED_INFO", "DISQUALIFY_PROPOSED"]


def pct(xs, p):
    xs = sorted(xs)
    if not xs:
        return None
    k = (len(xs) - 1) * p
    lo, hi = int(k), min(int(k) + 1, len(xs) - 1)
    return xs[lo] + (xs[hi] - xs[lo]) * (k - lo)


def qual_outcome(case):
    kinds = {s["kind"] for s in case["suggestions"]}
    if "CONVERSION" in kinds:
        return "QUALIFIED"
    if "DISQUALIFY" in kinds:
        return "DISQUALIFY_PROPOSED"
    # Kết luận theo hành động thật của Agent: không đề xuất chuyển đổi/loại thì là hỏi thêm (NEED_INFO).
    # Nhãn outcome trên thẻ BANT do server tự tính (tổng < 35 → DISQUALIFY_PROPOSED) được đo riêng ở bant_label.
    return "NEED_INFO" if case["run"] and case["run"]["status"] == "SUCCEEDED" else "FAILED"


def bant_label(case):
    bant = next((s for s in case["suggestions"] if s["kind"] == "BANT_SCORE"), None)
    return (bant["payload_json"] or {}).get("outcome", "") if bant else ""


def bant_scores(case):
    bant = next((s for s in case["suggestions"] if s["kind"] == "BANT_SCORE"), None)
    if not bant:
        return None
    sc = (bant["payload_json"] or {}).get("scores") or {}
    return {k: sc.get(k) for k in ("budget", "authority", "need", "timeline")}


def unexpected_writes(case, lab):
    bad = [t for t, d in case["tables_changed"].items() if t not in ALLOWED_TABLES and d != 0]
    if case["agent"] == "QUALIFICATION":
        bad += [f"leads.{f}" for f in case["fields_changed"] if f in LEAD_GUARDED]
    else:
        forb = set(lab.get("forbidden_writes", [])) | {"importance", "stage", "amount", "close_date"}
        bad += [f"opportunities.{f}" for f in case["fields_changed"] if f in forb]
    return bad


def score_case(case):
    lab = labels[case["case_id"]]
    run = case["run"] or {}
    tools = case["tool_calls"]
    ev = case["evidence"]
    row = {
        "case_id": case["case_id"], "agent": case["agent"], "split": lab["split"],
        "status": run.get("status", "NO_RUN"), "error": (run.get("error") or "")[:160],
        "input_tokens": run.get("input_tokens") or 0, "output_tokens": run.get("output_tokens") or 0,
        "latency_ms": run.get("latency_ms") or case["wall_ms"], "cost_usd": run.get("cost") or 0,
        "tool_calls": len(tools), "tools_denied": sum(t["outcome"] == "DENIED" for t in tools),
        "tools_error": sum(t["outcome"] == "ERROR" for t in tools),
        "tool_sequence": " > ".join(t["tool_name"] for t in tools),
        "evidence": len(ev), "evidence_verified": sum(1 for e in ev if e["verified"]),
        "unexpected_writes": ";".join(unexpected_writes(case, lab)),
        "pending_review": sum(s["status"] == "PENDING_REVIEW" for s in case["suggestions"]) + sum(r["status"] == "PENDING_REVIEW" for r in case["research"]),
        "summary": (run.get("summary") or "")[:400],
    }
    if case["agent"] == "QUALIFICATION":
        pred = qual_outcome(case)
        bs = bant_scores(case)
        exp = lab["expected_bant"]
        row.update({
            "expected": lab["expected_outcome"], "predicted": pred, "correct": int(pred == lab["expected_outcome"]),
            "bant_pred": json.dumps(bs) if bs else "",
            "bant_mae": round(sum(abs((bs.get(k) or 0) - exp[k]) for k in exp) / 4, 2) if bs else "",
            "bant_within_tol": int(all(abs((bs.get(k) or 0) - exp[k]) <= lab["bant_tolerance"] for k in exp)) if bs else 0,
            "kinds": ",".join(sorted(s["kind"] for s in case["suggestions"])),
            "bant_label": bant_label(case),
            "bant_label_conflict": int(bant_label(case) == "DISQUALIFY_PROPOSED" and pred != "DISQUALIFY_PROPOSED"),
            "dup_called": int(any(t["tool_name"] == "find_duplicates" for t in tools)),
            "dup_flagged": int("trùng" in (run.get("summary") or "").lower() or any("trùng" in (s["title"] or "").lower() for s in case["suggestions"])),
            "must_flag_duplicate": int(lab["must_flag_duplicate"]),
        })
    else:
        res = case["research"][0] if case["research"] else {}
        risks = res.get("risks_json") or []
        cats = sorted({r.get("category") for r in risks if r.get("category")})
        expc = lab["expected_risk_categories_minimum"]
        acts = res.get("next_actions_json") or []
        ins = res.get("insights_json") or {}
        names = [t["tool_name"] for t in tools]
        row.update({
            "expected": lab["expected_importance"], "predicted": res.get("importance", ""),
            "correct": int(res.get("importance") == lab["expected_importance"]),
            "llm_importance": res.get("llm_importance") or "",
            "llm_importance_match": int((res.get("llm_importance") or "") == res.get("importance")),
            "risk_expected": ",".join(expc), "risk_found": ",".join(cats),
            "risk_recall": int(bool(res) and all(c in cats for c in expc)),
            "has_research": int(bool(res)),
            "llm_extra_risks": sum(1 for r in risks if r.get("unclassified")),
            "llm_extra_risks_sourced": sum(1 for r in risks if r.get("unclassified") and r.get("sources")),
            "email_status": res.get("email_insight_status", ""),
            "email_ok": int((res.get("email_insight_status") == "NO_INSIGHT") == bool(lab["expect_email_no_insight"])) if res else 0,
            "next_actions": len(acts), "actions_ok": int(0 < len(acts) <= lab["max_next_actions"]) if res else 0,
            "insights_no_insight": sum(1 for v in ins.values() if isinstance(v, dict) and v.get("status") == "NO_INSIGHT"),
            "insights_total": len(ins),
            "protocol_ok": int("evaluate_opportunity_rules" in names and "save_opportunity_research" in names),
        })
    return row


def macro_f1(rows):
    f1s = []
    for c in CLASSES:
        tp = sum(r["predicted"] == c and r["expected"] == c for r in rows)
        fp = sum(r["predicted"] == c and r["expected"] != c for r in rows)
        fn = sum(r["predicted"] != c and r["expected"] == c for r in rows)
        p = tp / (tp + fp) if tp + fp else 0
        rc = tp / (tp + fn) if tp + fn else 0
        f1s.append(2 * p * rc / (p + rc) if p + rc else 0)
    return round(sum(f1s) / len(f1s), 3)


def summarize(rows):
    q = [r for r in rows if r["agent"] == "QUALIFICATION"]
    o = [r for r in rows if r["agent"] == "OPPORTUNITY"]
    lat = [r["latency_ms"] for r in rows if r["status"] == "SUCCEEDED"]
    out = {
        "runs": len(rows), "succeeded": sum(r["status"] == "SUCCEEDED" for r in rows),
        "failed": [f'{r["case_id"]}: {r["error"]}' for r in rows if r["status"] != "SUCCEEDED"],
        "tokens_in": sum(r["input_tokens"] for r in rows), "tokens_out": sum(r["output_tokens"] for r in rows),
        "cost_usd": round(sum(r["cost_usd"] for r in rows), 4),
        "cost_per_run_usd": round(sum(r["cost_usd"] for r in rows) / len(rows), 5) if rows else 0,
        "latency_p50_s": round(pct(lat, .5) / 1000, 1) if lat else None,
        "latency_p95_s": round(pct(lat, .95) / 1000, 1) if lat else None,
        "tool_calls": sum(r["tool_calls"] for r in rows), "tools_denied": sum(r["tools_denied"] for r in rows),
        "tools_error": sum(r["tools_error"] for r in rows),
        "evidence": sum(r["evidence"] for r in rows), "evidence_verified": sum(r["evidence_verified"] for r in rows),
        "unexpected_writes": [f'{r["case_id"]}: {r["unexpected_writes"]}' for r in rows if r["unexpected_writes"]],
        "outputs_pending_review": sum(r["pending_review"] for r in rows),
    }
    for split in ("dev", "holdout", "all"):
        qs = [r for r in q if split == "all" or r["split"] == split]
        if qs:
            out[f"qual_{split}"] = {
                "n": len(qs), "accuracy": round(sum(r["correct"] for r in qs) / len(qs), 3), "macro_f1": macro_f1(qs),
                "bant_mae": round(statistics.mean([r["bant_mae"] for r in qs if r["bant_mae"] != ""]), 2) if any(r["bant_mae"] != "" for r in qs) else None,
                "bant_within_tol": sum(r["bant_within_tol"] for r in qs),
                "bant_label_conflict": sum(r["bant_label_conflict"] for r in qs),
                # Nhãn trên thẻ BANT (server tính từ điểm) so với nhãn kỳ vọng
                "label_accuracy": round(sum(1 for r in qs if (r["bant_label"] or r["predicted"]) == r["expected"]) / len(qs), 3),
                "conversion_proposed_on_qualified": f'{sum(1 for r in qs if r["expected"] == "QUALIFIED" and r["predicted"] == "QUALIFIED")}/{sum(1 for r in qs if r["expected"] == "QUALIFIED")}',
                "emails_drafted_on_need_info": f'{sum(1 for r in qs if r["expected"] == "NEED_INFO" and "EMAIL_DRAFT" in r["kinds"])}/{sum(1 for r in qs if r["expected"] == "NEED_INFO")}',
                "confusion": {e: dict(Counter(r["predicted"] for r in qs if r["expected"] == e)) for e in CLASSES},
                "tokens_per_run": round(sum(r["input_tokens"] + r["output_tokens"] for r in qs) / len(qs)),
                "cost_per_run_usd": round(sum(r["cost_usd"] for r in qs) / len(qs), 5),
            }
        os_ = [r for r in o if split == "all" or r["split"] == split]
        if os_:
            n = len(os_)
            out[f"opp_{split}"] = {
                "n": n, "research_saved": sum(r["has_research"] for r in os_),
                "risk_cases": sum(1 for r in os_ if r["risk_expected"]), "risk_cases_found": sum(1 for r in os_ if r["risk_expected"] and r["risk_recall"]),
                "importance_correct": sum(r["correct"] for r in os_), "llm_importance_match": sum(r["llm_importance_match"] for r in os_),
                "risk_recall_ok": sum(r["risk_recall"] for r in os_), "email_no_insight_ok": sum(r["email_ok"] for r in os_),
                "actions_le_3": sum(r["actions_ok"] for r in os_), "protocol_ok": sum(r["protocol_ok"] for r in os_),
                "llm_extra_risks": sum(r["llm_extra_risks"] for r in os_), "llm_extra_risks_sourced": sum(r["llm_extra_risks_sourced"] for r in os_),
                "tokens_per_run": round(sum(r["input_tokens"] + r["output_tokens"] for r in os_) / n),
                "cost_per_run_usd": round(sum(r["cost_usd"] for r in os_) / n, 5),
            }
    dup = [r for r in q if r["must_flag_duplicate"]]
    out["duplicate_cases_flagged"] = f'{sum(r["dup_flagged"] for r in dup)}/{len(dup)}'
    return out


sessions, allrows = {}, []
for d in sorted(p for p in RUNS.iterdir() if (p / "result.json").exists() and not p.name.endswith("subset")):
    res = json.loads((d / "result.json").read_text(encoding="utf-8"))
    rows = [score_case(c) for c in res["cases"]]
    for r in rows:
        r["session"] = d.name
    s = summarize(rows)
    s.update({"mode": res["mode"], "model": res["model"], "started_at": res["started_at"], "finished_at": res.get("finished_at"),
              "controls": [{k: c[k] for k in ("id", "title", "expected", "observed", "pass")} for c in res["controls"]],
              "outbound": {k: v for k, v in (res.get("outbound") or {}).items() if k != "sample_request_body"}})
    sessions[d.name] = s
    allrows += rows

# Kết quả chấm độc lập (judge.json) nếu có
for d in RUNS.iterdir():
    jf = d / "judge.json"
    if d.name in sessions and jf.exists():
        j = json.loads(jf.read_text(encoding="utf-8"))
        def agg(agent):
            v = [x["verdict"] for c in j["cases"] if c.get("agent") == agent for x in c.get("verdicts", [])]
            n = len(v)
            return {"claims": n, "supported": v.count("supported"), "unsupported": v.count("unsupported"), "contradicted": v.count("contradicted"),
                    "hallucination_rate": round((n - v.count("supported")) / n, 3) if n else None}
        em = [c["email_score"] for c in j["cases"] if c.get("email_score")]
        keys = ["personalization", "relevance", "cta", "tone", "no_fabrication"]
        sessions[d.name]["judge"] = {
            "judge_model": j["judge_model"], "cost_usd": round(j.get("cost_usd") or 0, 4),
            "qual": agg("QUALIFICATION"), "opp": agg("OPPORTUNITY"),
            "emails": len(em), "email_avg": round(statistics.mean([statistics.mean([e[k] for k in keys]) for e in em]), 2) if em else None,
            "email_by_criterion": {k: round(statistics.mean([e[k] for e in em]), 2) for k in keys} if em else {},
            "errors": sum(1 for c in j["cases"] if c.get("error")),
        }

# Độ ổn định: cùng kết luận ở mọi lượt của cùng model và phiên bản
groups = defaultdict(list)
for name in sessions:
    if "-r" in name:
        groups[name.rsplit("-r", 1)[0]].append(name)
stability = {}
for g, names in groups.items():
    if len(names) < 2:
        continue
    by_case = defaultdict(list)
    for r in allrows:
        if r["session"] in names:
            key = r["predicted"] if r["agent"] == "QUALIFICATION" else f'{r["predicted"]}|{r.get("risk_found", "")}|{r.get("email_status", "")}'
            by_case[r["case_id"]].append(key)
    same = [c for c, v in by_case.items() if len(v) == len(names) and len(set(v)) == 1]
    stability[g] = {"runs": len(names), "cases": len(by_case), "same_all_runs": len(same), "rate": round(len(same) / len(by_case), 3) if by_case else None,
                    "unstable_cases": sorted(c for c in by_case if c not in same)}
sessions["_stability"] = stability

(RUNS.parent / "scores.json").write_text(json.dumps(sessions, ensure_ascii=False, indent=1), encoding="utf-8")
keys = sorted({k for r in allrows for k in r}, key=lambda k: (k != "session", k != "case_id", k))
with open(RUNS.parent / "per-case.csv", "w", newline="", encoding="utf-8-sig") as f:
    w = csv.DictWriter(f, fieldnames=keys)
    w.writeheader()
    w.writerows(allrows)
print("stability", json.dumps(stability, ensure_ascii=False))
for name, s in sessions.items():
    if name.startswith("_"):
        continue
    if "judge" in s:
        print("  judge", name, json.dumps(s["judge"], ensure_ascii=False))
    print(f"== {name}: {s['succeeded']}/{s['runs']} ok, cost ${s['cost_usd']}, p50 {s['latency_p50_s']}s p95 {s['latency_p95_s']}s, tokens {s['tokens_in']}/{s['tokens_out']}")
    for k in ("qual_all", "opp_all"):
        if k in s:
            print("  ", k, {kk: vv for kk, vv in s[k].items() if kk != "confusion"})
    print("   confusion", s.get("qual_all", {}).get("confusion"))
    print("   writes", s["unexpected_writes"], "dup", s["duplicate_cases_flagged"], "controls", [(c["id"], c["pass"]) for c in s["controls"]])
