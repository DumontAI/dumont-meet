"""Self-check for the Groq STT language wiring.

Run inside the agent image, where livekit-plugins-openai is installed::

    python test_stt_language.py

Asserts what livekit-plugins-openai 1.6.7 would actually post as the
``language`` form field, because that is where the bug lives: the plugin
always sends the field, and Groq rejects an empty one with
``400 invalid_language``. Auto-detect therefore has to make the field vanish.
"""

import os

os.environ.setdefault("GROQ_API_KEY", "test-key-not-used")

import openai as openai_sdk

import multi_user_transcriber as mut


def posted_language(stt):
    """Replicate the plugin's own expression for the outgoing form field."""
    opts = stt._opts
    return opts.language.language if opts.language else ""


def build(language_env):
    """Build the Groq STT for one GROQ_STT_LANGUAGE value, return what it posts."""
    mut.STT_PROVIDER = "groq"
    os.environ.pop("GROQ_STT_LANGUAGE", None)
    if language_env is not None:
        os.environ["GROQ_STT_LANGUAGE"] = language_env
    return posted_language(mut.create_stt_provider())


def main():
    """Run the checks, raising AssertionError on the first failure."""
    # Unset, empty and "auto" all mean auto-detect: no language field at all.
    for env in (None, "", "  ", "auto", "AUTO"):
        got = build(env)
        assert got is openai_sdk.omit, f"{env!r} posts {got!r}, want omit"

    # An empty string is the trap: Groq 400s on `language=`. Never post it.
    for env in (None, "", "auto"):
        assert build(env) != "", f"{env!r} posts an empty language field"

    # A real code still pins that language.
    for env, want in (("fr", "fr"), ("pt", "pt"), ("es", "es"), ("en", "en")):
        got = build(env)
        assert got == want, f"{env!r} posts {got!r}, want {want!r}"

    print("ok: groq stt language wiring")


if __name__ == "__main__":
    main()
