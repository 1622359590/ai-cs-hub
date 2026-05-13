"""
本地 Embedding 服务 — 使用 bge-small-zh-v1.5（免费，无 API 费用）
启动：source .venv/bin/activate && python3 embedding_server.py
端口：37889
"""
from flask import Flask, request, jsonify
from sentence_transformers import SentenceTransformer
import time

app = Flask(__name__)

# 加载模型（首次启动会自动下载 ~90MB）
print("🔄 正在加载 bge-small-zh-v1.5 模型...")
model = SentenceTransformer('BAAI/bge-small-zh-v1.5')
print(f"✅ 模型加载完成，向量维度: {model.get_sentence_embedding_dimension()}")

@app.route('/v1/embeddings', methods=['POST'])
def embeddings():
    """OpenAI 兼容的 Embedding API"""
    data = request.json
    input_text = data.get('input', '')

    # 支持单条字符串和数组
    if isinstance(input_text, str):
        texts = [input_text]
    elif isinstance(input_text, list):
        texts = input_text
    else:
        return jsonify({'error': 'invalid input'}), 400

    # 截断超长文本
    texts = [t[:2000] if isinstance(t, str) else '' for t in texts]

    start = time.time()
    vectors = model.encode(texts, normalize_embeddings=True)
    elapsed = time.time() - start

    # 返回 OpenAI 兼容格式
    results = []
    for i, vec in enumerate(vectors):
        results.append({
            'object': 'embedding',
            'embedding': vec.tolist(),
            'index': i,
        })

    return jsonify({
        'object': 'list',
        'data': results,
        'model': 'bge-small-zh-v1.5',
        'usage': {
            'prompt_tokens': sum(len(t) for t in texts),
            'total_tokens': sum(len(t) for t in texts),
        },
        'elapsed_ms': round(elapsed * 1000),
    })

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'model': 'bge-small-zh-v1.5'})

if __name__ == '__main__':
    print("🚀 Embedding 服务启动: http://localhost:37889")
    app.run(host='127.0.0.1', port=37889, debug=False)
