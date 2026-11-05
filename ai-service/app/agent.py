from app.llm import generate_with_fallback, stream_llm, stream_with_fallback
from app.rag import get_recent_chunks, search_chunks

TOOLS = ("answer", "quiz", "summary")

NOTES_WORDS = (
    "my notes",
    "my pdf",
    "uploaded",
    "the pdf",
    "this pdf",
    "my document",
    "the notes",
)

ROUTER_PROMPT = (
    "You are a router for a study assistant. Read the student's message and "
    "reply with exactly one word and nothing else:\n"
    "quiz - the student wants to be tested, or wants a quiz or practice questions\n"
    "summary - the student wants a summary, revision notes or key points of "
    "their uploaded notes\n"
    "answer - anything else, such as explaining a concept or answering a doubt\n\n"
    "Message: "
)


def keyword_route(question):
    text = question.lower()
    if any(w in text for w in ("quiz", "test me", "mcq", "practice questions")):
        return "quiz"
    if any(
        w in text
        for w in ("summarize", "summarise", "summary", "revision notes", "key points")
    ):
        return "summary"
    return "answer"


def choose_tool(question):
    try:
        reply = generate_with_fallback(ROUTER_PROMPT + question).strip().lower()
        word = reply.split()[0].strip(".,:;!\"'`*") if reply else ""
        if word in TOOLS:
            return word
    except Exception as e:
        print("Router fell back to keywords:", e)
    return keyword_route(question)


def safe_search(question, user_id, k):
    try:
        return search_chunks(question, user_id, k)
    except Exception as e:
        print("Note search skipped:", e)
        return []


def safe_recent(user_id, limit):
    try:
        return get_recent_chunks(user_id, limit)
    except Exception as e:
        print("Could not load recent notes:", e)
        return []


def sources_of(chunks):
    return sorted({c["filename"] for c in chunks})


def notes_text(chunks):
    return "\n\n---\n\n".join(
        f"[From {c['filename']}]\n{c['content']}" for c in chunks
    )


def say(text):
    yield text


def tool_answer(question, user_id):
    chunks = safe_search(question, user_id, 4)
    return stream_llm(question, chunks), sources_of(chunks)


def tool_quiz(question, user_id):
    chunks = safe_search(question, user_id, 6)
    if not chunks and any(w in question.lower() for w in NOTES_WORDS):
        chunks = safe_recent(user_id, 8)

    if chunks:
        source = (
            "Use these study notes as the main source:\n\n"
            f"{notes_text(chunks)}\n\n"
        )
    else:
        source = "Use your general knowledge of the topic.\n\n"

    prompt = (
        "Create a 5-question multiple-choice quiz for a student, based on "
        "their request below.\n\n"
        f"{source}"
        f"STUDENT REQUEST: {question}\n\n"
        "Format the quiz in Markdown: a short title, then 5 numbered "
        "questions. Write the options A, B, C and D as a bulleted list under "
        "each question. Do not reveal answers inside the questions. After the "
        "questions add a horizontal rule and a heading called Answer Key, "
        "listing the correct option and a one-line explanation for each "
        "question."
    )
    return stream_with_fallback(prompt), sources_of(chunks)


def tool_summary(question, user_id):
    chunks = safe_recent(user_id, 10)
    if not chunks:
        return (
            say(
                "You haven't uploaded any notes yet. Click **Attach**, add a "
                "PDF, and then ask me to summarize it."
            ),
            [],
        )

    prompt = (
        "Write a clear revision summary of the study notes below for a "
        "student. Use Markdown with: a short title, a section called Key "
        "Points (bullets), a section called Important Terms (each term with a "
        "simple meaning), and a section called Quick Recap (2 to 3 "
        "sentences). Stick to what the notes say.\n\n"
        f"STUDY NOTES:\n{notes_text(chunks)}\n\n"
        f"STUDENT REQUEST: {question}"
    )
    return stream_with_fallback(prompt), sources_of(chunks)


def run_agent(question, user_id):
    tool = choose_tool(question)
    print("Agent chose tool:", tool)
    if tool == "quiz":
        pieces, sources = tool_quiz(question, user_id)
    elif tool == "summary":
        pieces, sources = tool_summary(question, user_id)
    else:
        pieces, sources = tool_answer(question, user_id)
    return tool, pieces, sources