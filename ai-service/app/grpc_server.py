import os
import sys
from concurrent import futures

import grpc

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import doubt_pb2  # noqa: E402
import doubt_pb2_grpc  # noqa: E402

from app.agent import run_agent  # noqa: E402


class Assistant(doubt_pb2_grpc.AssistantServicer):
    def AskStream(self, request, context):
        question = request.question.strip()
        if not question:
            context.abort(grpc.StatusCode.INVALID_ARGUMENT, "question is required")

        try:
            tool, pieces, sources = run_agent(question, request.user_id)
            first = next(pieces, "")
        except Exception as e:
            print("gRPC ask failed:", str(e)[:150])
            context.abort(grpc.StatusCode.UNAVAILABLE, "The AI is busy")

        yield doubt_pb2.AskChunk(
            start=doubt_pb2.Start(tool=tool, sources=sources)
        )
        if first:
            yield doubt_pb2.AskChunk(text=first)

        failed = False
        try:
            for piece in pieces:
                yield doubt_pb2.AskChunk(text=piece)
        except Exception as e:
            print("gRPC stream stopped early:", str(e)[:150])
            failed = True

        if failed:
            context.abort(grpc.StatusCode.UNAVAILABLE, "The answer was interrupted")


def start_grpc(port=50051):
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    doubt_pb2_grpc.add_AssistantServicer_to_server(Assistant(), server)
    server.add_insecure_port(f"0.0.0.0:{port}")
    server.start()
    print(f"gRPC server listening on port {port}")
    return server