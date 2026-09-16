"""Unit tests for scripts/patch-webui-stream-finalize-settle.py.

Pattern mirrors tests/test_patch_stream_switch_leak.py: drive the patcher as a
subprocess against throwaway messages.js fixtures built from the patcher's own
pristine anchor constants, then assert markers/exit codes.

Scope (task webui-stream-finalize-integrity, D2/S1):
  - the painted-first settle block (currently applied by
    scripts/patch-hermes-webui-paint-first.py) wipes/never-rebuilds the live
    scene at `done`; the finalize patcher replaces it with a TWO-PHASE settle:
    keep the live scene mounted until the canonical settled assistant row is
    verifiably present in the DOM (helper injected alongside
    _restoreSettledSession), falling back to the canonical
    renderMessages({preserveScroll:true}) rebuild whenever verification fails,
    and only THEN clearing live tool cards / anchors (never unmount-before-
    mounted).
"""

import importlib.util
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATCHER = ROOT / "scripts" / "patch-webui-stream-finalize-settle.py"
ENTRYPOINT = ROOT.parents[1] / "scripts" / "hermes-fox-entrypoint.sh"
DOCKERFILE = ROOT.parents[1] / "Dockerfile.hermes"


def _load_patcher_module():
    spec = importlib.util.spec_from_file_location("_finalize_settle_patcher", PATCHER)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class PatchWebuiStreamFinalizeSettleTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.patcher = _load_patcher_module()

    def _make_fixture(self) -> tuple:
        """Return a structurally valid fixture with each pristine anchor once.

        The helper injection anchor belongs to the surrounding IIFE, not to the
        synthetic done listener. Keeping it outside that listener makes the
        fixture match the production structure and lets the structural matcher
        scope teardown anchors to the listener without counting the helper.
        """
        tmp = tempfile.TemporaryDirectory()
        messages = Path(tmp.name) / "messages.js"
        messages.write_text(
            "// messages.js fixture\n"
            + "source.addEventListener('done',e=>{\n"
            + "_applyToAnchor('done',{});\n"
            + self.patcher.ANCHOR_EARLY_TEARDOWN
            + "\nconst isActiveSession=true;\n"
            + self.patcher.ANCHOR_LIVE_CARD_TEARDOWN
            + "\n// done handler\n"
            + self.patcher.ANCHOR_SETTLE
            + "\n});\n// helper in the surrounding IIFE\n"
            + self.patcher.ANCHOR_HELPER
            + "\n}\n",
            encoding="utf-8",
        )
        return tmp, messages

    def _run(self, messages):
        return subprocess.run(
            ["python3", str(PATCHER), str(messages)],
            capture_output=True,
            text=True,
        )

    # ------------------------------------------------------------------
    # Contract shape
    # ------------------------------------------------------------------
    def test_patcher_contract_constants(self):
        self.assertTrue(self.patcher.IDEMPOTENCY_MARK)
        self.assertIn("vulpy", self.patcher.IDEMPOTENCY_MARK)
        # The settle anchor is EXACTLY the block paint-first installs (so this
        # patcher composes cleanly after paint-first on real bundles).
        self.assertIn("Paint-first settle", self.patcher.ANCHOR_SETTLE)
        self.assertIn("clearLiveToolCards()", self.patcher.ANCHOR_SETTLE)
        self.assertIn("_clearAnchorProseIncrementalNode()", self.patcher.ANCHOR_EARLY_TEARDOWN)
        self.assertNotIn("renderMessages({preserveScroll:true})", self.patcher.ANCHOR_SETTLE)
        # Replacement implements two-phase settle semantics.
        self.assertIn(self.patcher.IDEMPOTENCY_MARK, self.patcher.REPLACEMENT_SETTLE)
        self.assertIn("renderMessages({preserveScroll:true})", self.patcher.REPLACEMENT_SETTLE)
        # Rebuild-path ordering (PHASE 2b): canonical rebuild happens BEFORE
        # live cards are torn down (never unmount-before-mounted). Scoped to
        # the fallback branch — the verified-swap branch legitimately skips
        # the rebuild entirely.
        else_branch = self.patcher.REPLACEMENT_SETTLE.split("}else{", 1)[-1]
        self.assertLess(
            else_branch.index("renderMessages({preserveScroll:true})"),
            else_branch.index("clearLiveToolCards()"),
            "canonical rebuild must happen BEFORE live cards are torn down "
            "(never unmount-before-mounted)",
        )
        # Helper performs a real DOM verification against the settled content.
        self.assertIn("data-raw-text", self.patcher.REPLACEMENT_HELPER)
        self.assertIn(self.patcher.IDEMPOTENCY_MARK, self.patcher.REPLACEMENT_HELPER)
        # Compare against the answer accumulated by the live stream, not a
        # possibly stale value reconstructed from the settled merge.
        self.assertIn("expectedText:assistantText", self.patcher.REPLACEMENT_SETTLE)
        self.assertIn("opts&&opts.expectedText!==undefined", self.patcher.REPLACEMENT_HELPER)
        self.assertNotIn("text.length>=Math.min(expectedRaw.length,40)", self.patcher.REPLACEMENT_HELPER)

    def test_stale_merge_and_short_dom_prefix_are_rejected(self):
        """A stale settled merge or a 40-char mounted prefix cannot pass settle."""
        helper = self.patcher.REPLACEMENT_HELPER.split(
            "  async function _restoreSettledSession", 1
        )[0]
        script = f"""
const actual = "a".repeat(200);
const prefix = actual.slice(0, 40);
const elements = [{{
  getAttribute(name) {{
    if (name === 'data-raw-text') return prefix;
    if (name === 'data-message-index') return '1';
    return '';
  }},
  querySelector() {{ return null; }},
  textContent: prefix,
}}];
globalThis.window = {{}};
globalThis.document = {{ querySelectorAll() {{ return elements; }} }};
const S = {{ session: {{ session_id: 's1' }}, messages: [
  {{ role: 'assistant', content: 'earlier answer' }},
  {{ role: 'assistant', content: actual }}
] }};
{helper}
const result = window._settleVerifyFinalizeDom({{ expectedText: actual, expectedPosition: 1 }});
if (result.ok || result.reason !== 'settled-row-not-mounted') throw new Error('expected DOM failure, got ' + result.reason);
console.log(result.reason);
"""
        result = subprocess.run(["node", "--eval", script], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        self.assertIn(result.stdout.strip(), {"settled-answer-not-in-merge", "settled-row-not-mounted"})

        # A stale merge and stale DOM must not pass merely because the helper
        # derives its expected value from S.messages.
        stale_script = script.replace(
            "content: actual", "content: 'earlier answer'"
        )
        stale_script = stale_script.replace(
            "result.reason !== 'settled-row-not-mounted'", "result.reason !== 'settled-answer-not-in-merge'"
        )
        stale_result = subprocess.run(["node", "--eval", stale_script], capture_output=True, text=True)
        self.assertEqual(stale_result.returncode, 0, stale_result.stderr + stale_result.stdout)
        self.assertIn("settled-answer-not-in-merge", stale_result.stdout)

    def test_repeated_answer_uses_completed_entry_position_not_any_match(self):
        """The production teardown guard uses the completed entry position."""
        helper = self.patcher.REPLACEMENT_HELPER.split(
            "  async function _restoreSettledSession", 1
        )[0]
        script = f"""
const answer = "repeated answer";
const elements = [
  {{ getAttribute(name) {{ return name === 'data-raw-text' ? answer : ''; }}, querySelector() {{ return null; }}, textContent: answer }},
  {{ getAttribute() {{ return ''; }}, querySelector() {{ return null; }}, textContent: 'new live answer' }}
];
globalThis.window = {{}};
globalThis.document = {{ querySelectorAll() {{ return elements; }} }};
let rebuilds = 0;
globalThis.renderMessages = () => {{ rebuilds += 1; }};
const S = {{ session: {{ session_id: 's1' }}, messages: [
  {{ role: 'assistant', content: answer }},
  {{ role: 'assistant', content: answer }}
] }};
{helper}
window._settleGuardBeforeTeardown(answer, 1);
if (rebuilds !== 1) throw new Error('older identical DOM entry incorrectly verified');
console.log('guard-rebuilt');
"""
        result = subprocess.run(["node", "--eval", script], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        self.assertIn("guard-rebuilt", result.stdout)

    def test_repeated_identical_answer_requires_stable_dom_identity(self):
        """Same text at the expected position is not enough without node identity."""
        helper = self.patcher.REPLACEMENT_HELPER.split(
            "  async function _restoreSettledSession", 1
        )[0]
        script = f"""
const answer = "repeated answer";
const elements = [
  {{ getAttribute(name) {{ return name === 'data-raw-text' ? answer : ''; }}, querySelector() {{ return null; }}, textContent: answer }},
  {{ getAttribute(name) {{ return name === 'data-raw-text' ? answer : ''; }}, querySelector() {{ return null; }}, textContent: answer }}
];
const assistantRow = elements[0];
globalThis.window = {{}};
globalThis.document = {{ querySelectorAll() {{ return elements; }} }};
let rebuilds = 0;
globalThis.renderMessages = () => {{ rebuilds += 1; }};
const S = {{ session: {{ session_id: 's1' }}, messages: [
  {{ role: 'assistant', content: answer, id: 'old' }},
  {{ role: 'assistant', content: answer, id: 'new' }}
] }};
{helper}
window._settleGuardBeforeTeardown(answer, 1, 'new', assistantRow);
if (rebuilds !== 1) throw new Error('same-text stale DOM node incorrectly verified');
console.log('identity-rejected');
"""
        result = subprocess.run(["node", "--eval", script], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        self.assertIn("identity-rejected", result.stdout)

    def test_connected_live_assistant_row_avoids_false_fallback_render(self):
        """The connected native live row is already mounted before settlement."""
        helper = self.patcher.REPLACEMENT_HELPER.split(
            "  async function _restoreSettledSession", 1
        )[0]
        script = f"""
const answer = "the complete streamed answer";
const liveRow = {{
  isConnected: true,
  getAttribute(name) {{
    if (name === 'data-live-assistant') return '1';
    if (name === 'data-raw-text') return '';
    return '';
  }},
  querySelector() {{ return null; }},
  textContent: answer,
}};
globalThis.window = {{}};
globalThis.document = {{ querySelectorAll(selector) {{
  if (selector === '.msg-row[data-role="assistant"], .assistant-segment[data-raw-text], [data-live-assistant="1"]') return [liveRow];
  return [];
}} }};
let rebuilds = 0;
globalThis.renderMessages = () => {{ rebuilds += 1; }};
const completedEntry = {{ role: 'assistant', content: answer, id: 'new' }};
const S = {{ session: {{ session_id: 's1' }}, messages: [completedEntry] }};
{helper}
const result = window._settleVerifyFinalizeDom({{
  expectedText: answer,
  expectedPosition: 0,
  expectedMessageId: 'new',
  expectedElement: liveRow,
}});
if (!result.ok) throw new Error('connected live row rejected: ' + result.reason);
window._settleGuardBeforeTeardown(answer, 0, 'new', liveRow);
if (rebuilds !== 0) throw new Error('false fallback render requested');
console.log('live-row-accepted');
"""
        result = subprocess.run(["node", "--eval", script], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        self.assertIn("live-row-accepted", result.stdout)

    def test_decoy_outside_finalize_handler_does_not_make_anchor_ambiguous(self):
        """An identical-looking teardown outside the done listener is ignored."""
        tmp, messages = self._make_fixture()
        self.addCleanup(tmp.cleanup)
        text = messages.read_text(encoding="utf-8")
        decoy = (
            "_applyToAnchor('done',{});\n"
            + self.patcher.ANCHOR_EARLY_TEARDOWN
            + "\nconst isActiveSession=true;\n"
            + "clearLiveToolCards();\n"
        )
        messages.write_text(decoy + text, encoding="utf-8")

        result = self._run(messages)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        patched = messages.read_text(encoding="utf-8")
        self.assertIn(decoy, patched)
        self.assertIn(self.patcher.REPLACEMENT_EARLY_TEARDOWN, patched)

    def test_done_sequence_defers_all_destructive_teardowns_until_after_verification(self):
        """No live scene teardown may occur before the finalize verifier."""
        tmp, messages = self._make_fixture()
        self.addCleanup(tmp.cleanup)
        text = messages.read_text(encoding="utf-8")
        messages.write_text(text, encoding="utf-8")
        result = self._run(messages)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        patched = messages.read_text(encoding="utf-8")
        start = patched.index("source.addEventListener('done',e=>{")
        end = patched.rindex("\n});") + len("\n});")
        done_scope = patched[start:end]
        verify = done_scope.index("_settleVerifyFinalizeDom")
        self.assertNotIn("_clearAnchorProseIncrementalNode();", done_scope[:verify])
        self.assertNotIn("clearLiveToolCards();", done_scope[:verify])
        self.assertLess(verify, done_scope.rindex("clearLiveToolCards();"))

    def test_current_served_bundle_patches_structural_done_teardown_and_is_idempotent(self):
        """The current served bundle is patched only at the done-handler site."""
        served = Path("/app/hermes-webui/static/messages.js")
        if not served.exists():
            self.skipTest("served WebUI bundle is unavailable")
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        messages = Path(tmp.name) / "messages.js"
        messages.write_bytes(served.read_bytes())

        before = messages.read_text(encoding="utf-8")
        self.assertEqual(before.count(self.patcher.ANCHOR_EARLY_TEARDOWN), 5)
        first = self._run(messages)
        self.assertEqual(first.returncode, 0, first.stderr + first.stdout)
        patched = messages.read_text(encoding="utf-8")
        self.assertEqual(patched.count(self.patcher.ANCHOR_EARLY_TEARDOWN), 5)
        self.assertIn(self.patcher.IDEMPOTENCY_MARK, patched)
        self.assertIn("[data-live-assistant=\"1\"]", patched)
        second = self._run(messages)
        self.assertEqual(second.returncode, 0, second.stderr + second.stdout)
        self.assertEqual(messages.read_bytes(), patched.encode())
        parse = subprocess.run(["node", "--check", str(messages)], capture_output=True, text=True)
        self.assertEqual(parse.returncode, 0, parse.stderr + parse.stdout)

    def test_fallback_render_precedes_earlier_destructive_teardown_fixture(self):
        """The fixture models done ordering: guard/rebuild must precede teardown."""
        fallback = self.patcher.REPLACEMENT_SETTLE.split("}else{", 1)[-1]
        fixture = (
            "verify();\n"
            "renderMessages({preserveScroll:true});\n"
            "_clearAnchorProseIncrementalNode();\n"
            "clearLiveToolCards();\n"
        )
        self.assertLess(fixture.index("renderMessages({preserveScroll:true})"), fixture.index("_clearAnchorProseIncrementalNode()"))
        self.assertLess(fixture.index("renderMessages({preserveScroll:true})"), fixture.index("clearLiveToolCards()"))
        self.assertLess(fallback.index("renderMessages({preserveScroll:true})"), fallback.index("clearLiveToolCards()"))

    def test_boot_order_bakes_but_does_not_build_apply_finalize_patcher(self):
        """Finalize composes at boot after paint-first, never on a pristine bundle."""
        entrypoint = ENTRYPOINT.read_text(encoding="utf-8")
        paint = entrypoint.index("patch-hermes-webui-paint-first.py")
        finalize = entrypoint.index("patch-webui-stream-finalize-settle.py")
        self.assertGreater(finalize, paint)
        self.assertIn("/app/hermes-webui/static/messages.js", entrypoint[finalize : finalize + 300])

        dockerfile = DOCKERFILE.read_text(encoding="utf-8")
        copy = dockerfile.index("COPY extensions/hermes-webui/scripts/patch-webui-stream-finalize-settle.py")
        docker_slice = dockerfile[copy : copy + 220]
        self.assertIn("/usr/local/bin/patch-webui-stream-finalize-settle.py", docker_slice)
        self.assertNotIn("RUN mkdir", docker_slice)
        self.assertNotIn("RUN chmod", docker_slice)
        self.assertEqual(
            dockerfile.count(
                "COPY extensions/hermes-webui/scripts/patch-webui-stream-finalize-settle.py"
            ),
            1,
        )
        self.assertNotIn(
            "RUN python3 /tmp/patch-webui-stream-finalize-settle.py",
            dockerfile,
            "the finalize patch must not run on the pristine Dockerfile bundle",
        )

    # ------------------------------------------------------------------
    # Upgrade path (v1 -> v2): the previous [vulpy-stream-finalize-settle]
    # patch must migrate to the v2 two-phase settle semantics (live-row
    # DOM selector + v2 marker), converge with a fresh v2 apply, stay
    # idempotent, and FAIL LOUDLY on a drifted v1 shape instead of being
    # silently renamed to v2.
    # ------------------------------------------------------------------
    def _make_v1_patched_fixture(self, mutate_settle=None, mutate_helper=None):
        """Build a fixture carrying the PREVIOUS (v1) finalize patch shape."""
        tmp, messages = self._make_fixture()
        self.addCleanup(tmp.cleanup)
        text = messages.read_text(encoding="utf-8")
        v1_early = self.patcher.REPLACEMENT_EARLY_TEARDOWN.replace(
            self.patcher.IDEMPOTENCY_MARK, self.patcher.PREVIOUS_IDEMPOTENCY_MARK
        )
        v1_live = self.patcher.REPLACEMENT_LIVE_CARD_TEARDOWN.replace(
            self.patcher.IDEMPOTENCY_MARK, self.patcher.PREVIOUS_IDEMPOTENCY_MARK
        )
        v1_settle = self.patcher.REPLACEMENT_SETTLE.replace(
            self.patcher.IDEMPOTENCY_MARK, self.patcher.PREVIOUS_IDEMPOTENCY_MARK
        )
        v1_helper = self.patcher.REPLACEMENT_HELPER.replace(
            self.patcher.IDEMPOTENCY_MARK, self.patcher.PREVIOUS_IDEMPOTENCY_MARK
        ).replace(self.patcher.NEW_DOM_SELECTOR, self.patcher.OLD_DOM_SELECTOR)
        if mutate_settle:
            v1_settle = mutate_settle(v1_settle)
        if mutate_helper:
            v1_helper = mutate_helper(v1_helper)
        # Replace the standalone teardown lines using UNIQUE surrounding
        # context (they are the only occurrences of those anchors outside
        # ANCHOR_SETTLE, whose internal clearLiveToolCards() must stay
        # intact until the settle-block replacement below).
        v1_text = text.replace(
            "_applyToAnchor('done',{});\n" + self.patcher.ANCHOR_EARLY_TEARDOWN,
            "_applyToAnchor('done',{});\n" + v1_early,
        )
        v1_text = v1_text.replace(
            "const isActiveSession=true;\n" + self.patcher.ANCHOR_LIVE_CARD_TEARDOWN,
            "const isActiveSession=true;\n" + v1_live,
        )
        v1_text = v1_text.replace(self.patcher.ANCHOR_SETTLE, v1_settle)
        v1_text = v1_text.replace(self.patcher.ANCHOR_HELPER, v1_helper)
        messages.write_text(v1_text, encoding="utf-8")
        return tmp, messages

    def test_v1_patched_fixture_migrates_to_v2_and_is_idempotent(self):
        """Upgrade coverage: a bundle carrying the previous patch is migrated
        to the v2 two-phase settle (selector + marker), converges byte-for-byte
        with a fresh v2 apply, parses, and is idempotent on re-run."""
        tmp, messages = self._make_v1_patched_fixture()
        before = messages.read_text(encoding="utf-8")
        self.assertIn(self.patcher.PREVIOUS_IDEMPOTENCY_MARK, before)
        self.assertIn(self.patcher.OLD_DOM_SELECTOR, before)
        self.assertNotIn(self.patcher.NEW_DOM_SELECTOR, before)

        result = self._run(messages)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        migrated = messages.read_text(encoding="utf-8")
        self.assertIn(self.patcher.IDEMPOTENCY_MARK, migrated)
        self.assertNotIn(self.patcher.PREVIOUS_IDEMPOTENCY_MARK, migrated)
        # OLD_DOM_SELECTOR is a prefix-substring of NEW_DOM_SELECTOR, so the
        # only allowed occurrence of the old form is inside the single new
        # selector after the migration.
        self.assertEqual(migrated.count(self.patcher.NEW_DOM_SELECTOR), 1)
        self.assertEqual(
            migrated.count(self.patcher.OLD_DOM_SELECTOR),
            migrated.count(self.patcher.NEW_DOM_SELECTOR),
        )
        parse = subprocess.run(
            ["node", "--check", str(messages)], capture_output=True, text=True
        )
        self.assertEqual(parse.returncode, 0, parse.stderr + parse.stdout)

        # Convergence: a fresh v2 apply must produce the identical bundle.
        tmp2, fresh = self._make_fixture()
        self.addCleanup(tmp2.cleanup)
        fresh_result = self._run(fresh)
        self.assertEqual(fresh_result.returncode, 0, fresh_result.stderr + fresh_result.stdout)
        self.assertEqual(fresh.read_bytes(), messages.read_bytes())

        # Idempotent re-run on the migrated file.
        second = self._run(messages)
        self.assertEqual(second.returncode, 0, second.stderr + second.stdout)
        self.assertIn("already", second.stdout.lower())
        self.assertEqual(messages.read_bytes(), migrated.encode())

    def test_v1_migration_rejects_drifted_settle_shape(self):
        """Upgrade safety: a v1-patched bundle whose settle block drifted must
        fail loudly instead of being silently renamed to v2."""
        def mutate(v1_settle):
            return v1_settle.replace("finalizeThinkingCard()", "finalizeThinkingCardX()")

        tmp, messages = self._make_v1_patched_fixture(mutate_settle=mutate)
        result = self._run(messages)
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        combined = (result.stdout + result.stderr).lower()
        self.assertIn("previous", combined)
        self.assertIn("settle", combined)

    def test_v1_migration_rejects_drifted_helper_shape(self):
        """Upgrade safety: a v1-patched bundle whose verifier helper drifted
        must fail loudly instead of being silently renamed to v2."""
        def mutate(v1_helper):
            return v1_helper.replace(
                "window._settleGuardBeforeTeardown=_settleGuardBeforeTeardown;", ""
            )

        tmp, messages = self._make_v1_patched_fixture(mutate_helper=mutate)
        result = self._run(messages)
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        combined = (result.stdout + result.stderr).lower()
        self.assertIn("previous", combined)
        self.assertIn("helper", combined)

    # ------------------------------------------------------------------
    # Fresh fixture -> patched once
    # ------------------------------------------------------------------
    def test_fresh_fixture_patches_both_sites(self):
        tmp, messages = self._make_fixture()
        self.addCleanup(tmp.cleanup)

        result = self._run(messages)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)

        text = messages.read_text(encoding="utf-8")
        self.assertIn(self.patcher.IDEMPOTENCY_MARK, text)
        self.assertIn(self.patcher.REPLACEMENT_SETTLE, text)
        self.assertIn(self.patcher.REPLACEMENT_HELPER, text)
        self.assertEqual(text.count(self.patcher.ANCHOR_EARLY_TEARDOWN), 0)
        self.assertIn(self.patcher.REPLACEMENT_EARLY_TEARDOWN, text)
        # Settle anchor fully consumed; helper anchor is intentionally
        # preserved (replacement = injected verifier + the original line),
        # so post-patch it must appear EXACTLY once (original + injected copy).
        self.assertNotIn(self.patcher.ANCHOR_SETTLE, text)
        self.assertEqual(text.count(self.patcher.ANCHOR_HELPER), 1)

    # ------------------------------------------------------------------
    # Idempotency: re-run on patched file -> exit 0, no double-apply
    # ------------------------------------------------------------------
    def test_rerun_on_patched_file_is_idempotent_noop(self):
        tmp, messages = self._make_fixture()
        self.addCleanup(tmp.cleanup)
        first = self._run(messages)
        self.assertEqual(first.returncode, 0, first.stderr + first.stdout)
        patched_bytes = messages.read_bytes()

        second = self._run(messages)
        self.assertEqual(second.returncode, 0, second.stderr + second.stdout)
        self.assertEqual(messages.read_bytes(), patched_bytes, "no double-apply")
        self.assertIn("already", second.stdout.lower())

    # ------------------------------------------------------------------
    # Fail-loud: mutated anchor -> exit 1 naming the anchor
    # ------------------------------------------------------------------
    def test_mutated_settle_anchor_fails_loudly(self):
        tmp, messages = self._make_fixture()
        self.addCleanup(tmp.cleanup)
        text = messages.read_text(encoding="utf-8").replace("clearLiveToolCards()", "clobberedCards()")
        messages.write_text(text, encoding="utf-8")

        result = self._run(messages)
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        combined = result.stdout + result.stderr
        self.assertIn("settle", combined.lower())

    def test_ambiguous_done_teardown_scope_fails_loudly(self):
        tmp, messages = self._make_fixture()
        self.addCleanup(tmp.cleanup)
        text = messages.read_text(encoding="utf-8")
        text = text.replace(
            "\n// done handler\n",
            "\n_applyToAnchor('done',{});\n"
            + self.patcher.ANCHOR_EARLY_TEARDOWN
            + "\nconst isActiveSessionDuplicate=true;\n\n// done handler\n",
        )
        messages.write_text(text, encoding="utf-8")

        syntax = subprocess.run(["node", "--check", str(messages)], capture_output=True, text=True)
        self.assertEqual(syntax.returncode, 0, syntax.stderr + syntax.stdout)
        result = self._run(messages)
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn(
            "done-handler teardown anchors appear 3 times (expected 2)",
            result.stderr,
        )

    def test_mutated_helper_anchor_fails_loudly(self):
        tmp, messages = self._make_fixture()
        self.addCleanup(tmp.cleanup)
        text = messages.read_text(encoding="utf-8").replace(
            self.patcher.ANCHOR_HELPER, "// helper anchor removed\n"
        )
        messages.write_text(text, encoding="utf-8")

        result = self._run(messages)
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn("helper", (result.stdout + result.stderr).lower())

    # ------------------------------------------------------------------
    # Usage error
    # ------------------------------------------------------------------
    def test_wrong_arg_count_fails_loudly(self):
        result = subprocess.run(["python3", str(PATCHER)], capture_output=True, text=True)
        self.assertEqual(result.returncode, 1)
        self.assertIn("Usage", result.stderr)


if __name__ == "__main__":
    unittest.main()
