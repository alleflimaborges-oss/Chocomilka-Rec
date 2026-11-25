from datetime import date
from pathlib import Path
import math
import re
import sys
from flask import Flask, request, jsonify, render_template, send_from_directory, abort
from jinja2 import FileSystemLoader, TemplateNotFound

PASTA_PROJETO = Path(__file__).resolve().parent
sys.path.insert(0, str(PASTA_PROJETO))

from dao import ProdutoDAO, NomeDuplicado, RegistroEmUso
from models import Produto, Fornecedor, Funcionario

ARQUIVOS_DO_SITE = ["index.html", "catalogo.html", "historico.html", "fornecedores.html",
                    "funcionarios.html", "sobre.html", "style.css", "script.js", "catalogo.js",
                    "historico.js", "fornecedores.js", "funcionarios.js"]


def localizar_pastas_do_site():
    """Pastas onde procurar as páginas, o CSS e o JavaScript: a do app.py, a de cima
    e subpastas comuns. Assim o site abre mesmo que o app.py esteja dentro de uma
    pasta 'python' e as páginas fiquem na pasta do projeto."""
    bases = [PASTA_PROJETO, PASTA_PROJETO.parent]
    nomes = ["html", "javascript", "style", "css", "js", "frontend", "front",
             "site", "public", "templates", "static"]
    candidatas = bases + [base / nome for base in bases for nome in nomes]
    return [pasta for pasta in candidatas if pasta.is_dir()]


PASTAS_DO_SITE = localizar_pastas_do_site()

app = Flask(__name__)
app.jinja_loader = FileSystemLoader([str(pasta) for pasta in PASTAS_DO_SITE])
app.config["MAX_CONTENT_LENGTH"] = 6 * 1024 * 1024  # fotos de até 6 MB
dao = ProdutoDAO()

# As fotos ficam em arquivos (imagens/produto_<id>.jpg|png|webp), sem coluna nova no banco.
PASTA_IMAGENS = PASTA_PROJETO / "imagens"
PASTA_IMAGENS.mkdir(exist_ok=True)

CAMPOS = ["nome", "categoria", "fornecedor", "preco", "quantidade_estoque", "estoque_minimo"]
LIMITE_TEXTO = 80


def validar_produto(dados):
    """Valida e limpa os dados de um produto.
    Devolve (dados_limpos, None) ou (None, mensagem_de_erro)."""
    if any(campo not in dados for campo in CAMPOS):
        return None, "Preencha todos os campos obrigatórios."

    try:
        limpos = {
            "nome": str(dados["nome"]).strip(),
            "categoria": str(dados["categoria"]).strip(),
            "fornecedor": str(dados["fornecedor"]).strip(),
            "quantidade_estoque": int(dados["quantidade_estoque"]),
            "estoque_minimo": int(dados["estoque_minimo"]),
            "preco": float(str(dados["preco"]).replace(",", ".")),
        }
    except (TypeError, ValueError):
        return None, "Quantidade e estoque mínimo devem ser inteiros, e o preço um número."

    if not all(limpos[c] for c in ("nome", "categoria", "fornecedor")):
        return None, "Preencha nome, categoria e fornecedor."
    if any(len(limpos[c]) > LIMITE_TEXTO for c in ("nome", "categoria", "fornecedor")):
        return None, f"Use no máximo {LIMITE_TEXTO} caracteres nos campos de texto."
    if not math.isfinite(limpos["preco"]) or limpos["preco"] < 0:
        return None, "O preço não pode ser negativo."
    limpos["preco"] = round(limpos["preco"], 2)
    if limpos["quantidade_estoque"] < 0 or limpos["estoque_minimo"] < 0:
        return None, "Quantidade e estoque mínimo não podem ser negativos."

    validade = str(dados.get("validade") or "").strip()
    if validade:
        try:
            date.fromisoformat(validade)
        except ValueError:
            return None, "Data de validade inválida."
    limpos["validade"] = validade or None
    return limpos, None


def corpo_json():
    dados = request.get_json(silent=True)
    return dados if isinstance(dados, dict) else {}


def validar_fornecedor(dados):
    nome = str(dados.get("nome") or "").strip()
    telefone = str(dados.get("telefone") or "").strip()
    email = str(dados.get("email") or "").strip()

    if not nome:
        return None, "Informe o nome do fornecedor."
    if len(nome) > LIMITE_TEXTO:
        return None, f"Use no máximo {LIMITE_TEXTO} caracteres no nome."
    if telefone:
        digitos = re.sub(r"\D", "", telefone)
        if len(telefone) > 30 or not 10 <= len(digitos) <= 13:
            return None, "Telefone inválido. Use DDD e número, como (19) 99999-9999."
    if email and (len(email) > 120 or not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email)):
        return None, "E-mail inválido. Use o formato nome@exemplo.com."
    return {"nome": nome, "telefone": telefone or None, "email": email or None}, None


def validar_funcionario(dados):
    nome = str(dados.get("nome") or "").strip()
    cargo = str(dados.get("cargo") or "").strip()

    if not nome or not cargo:
        return None, "Preencha o nome e o cargo."
    if len(nome) > LIMITE_TEXTO or len(cargo) > LIMITE_TEXTO:
        return None, f"Use no máximo {LIMITE_TEXTO} caracteres nos campos."
    return {"nome": nome, "cargo": cargo}, None


def arquivo_foto(id_produto):
    achados = sorted(PASTA_IMAGENS.glob(f"produto_{id_produto}.*"))
    return achados[0] if achados else None


def tipo_da_imagem(conteudo):
    """Descobre o tipo real pelo conteúdo do arquivo (não confia na extensão)."""
    if conteudo.startswith(b"\xff\xd8\xff"):
        return "jpg"
    if conteudo.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if conteudo[:4] == b"RIFF" and conteudo[8:12] == b"WEBP":
        return "webp"
    return None


def com_foto(produto):
    """Acrescenta ao dict do produto se ele tem foto e a 'versão' dela (para atualizar o cache)."""
    arquivo = arquivo_foto(produto["id_produto"])
    produto["tem_foto"] = arquivo is not None
    produto["foto_versao"] = int(arquivo.stat().st_mtime) if arquivo else 0
    return produto


def apagar_fotos(id_produto):
    for arquivo in PASTA_IMAGENS.glob(f"produto_{id_produto}.*"):
        arquivo.unlink()


def montar_produto(id_produto, d):
    # id_categoria e id_fornecedor são resolvidos pelo DAO a partir dos nomes
    return Produto(id_produto, d["nome"], d["preco"], d["quantidade_estoque"],
                   d["estoque_minimo"], d["validade"], None, None)


@app.route("/")
def inicio():
    return render_template("index.html")


@app.route("/sobre")
def sobre():
    return render_template("sobre.html")


@app.route("/catalogo")
def catalogo():
    return render_template("catalogo.html")


@app.route("/historico")
def historico():
    return render_template("historico.html")


@app.route("/fornecedores")
def pagina_fornecedores():
    return render_template("fornecedores.html")


@app.route("/funcionarios")
def pagina_funcionarios():
    return render_template("funcionarios.html")


@app.route("/<nome>")
def arquivo_do_site(nome):
    """Entrega o CSS e os JavaScripts do site (somente os da lista permitida)."""
    if nome in ARQUIVOS_DO_SITE and not nome.endswith(".html"):
        for pasta in PASTAS_DO_SITE:
            if (pasta / nome).is_file():
                return send_from_directory(str(pasta), nome)
    abort(404)


@app.route("/produtos", methods=["GET"])
def listar_produtos():
    return jsonify([com_foto(p) for p in dao.buscar_todos()])


@app.route("/produtos", methods=["POST"])
def criar_produto():
    dados, erro = validar_produto(request.get_json(silent=True) or {})
    if erro:
        return jsonify({"erro": erro}), 400

    id_gerado = dao.inserir(montar_produto(None, dados), dados["categoria"], dados["fornecedor"])
    return jsonify({"mensagem": f"“{dados['nome']}” foi cadastrado.",
                    "produto": com_foto(dao.buscar_por_id(id_gerado))}), 201


@app.route("/produtos/<int:id_produto>", methods=["GET"])
def buscar_produto(id_produto):
    produto = dao.buscar_por_id(id_produto)
    if produto is None:
        return jsonify({"erro": "Produto não encontrado."}), 404
    return jsonify(com_foto(produto))


@app.route("/produtos/<int:id_produto>", methods=["PUT"])
def atualizar_produto(id_produto):
    dados, erro = validar_produto(request.get_json(silent=True) or {})
    if erro:
        return jsonify({"erro": erro}), 400

    if not dao.atualizar(id_produto, montar_produto(id_produto, dados),
                         dados["categoria"], dados["fornecedor"]):
        return jsonify({"erro": "Produto não encontrado."}), 404
    return jsonify({"mensagem": f"As alterações em “{dados['nome']}” foram salvas.",
                    "produto": com_foto(dao.buscar_por_id(id_produto))})


@app.route("/produtos/<int:id_produto>/quantidade", methods=["PATCH"])
def ajustar_quantidade(id_produto):
    """Ajuste rápido (+1 / -1) feito direto na lista; gera uma movimentação."""
    dados = request.get_json(silent=True) or {}
    try:
        variacao = int(dados["variacao"])
    except (KeyError, TypeError, ValueError):
        return jsonify({"erro": "Informe a variação como número inteiro."}), 400

    produto = dao.ajustar_quantidade(id_produto, variacao)
    if produto is None:
        return jsonify({"erro": "Produto não encontrado."}), 404
    return jsonify(com_foto(produto))


@app.route("/produtos/<int:id_produto>", methods=["DELETE"])
def remover_produto(id_produto):
    if not dao.remover(id_produto):
        return jsonify({"erro": "Produto não encontrado."}), 404
    apagar_fotos(id_produto)
    return jsonify({"mensagem": "Produto excluído."})


@app.route("/produtos/<int:id_produto>/foto", methods=["GET"])
def ver_foto(id_produto):
    arquivo = arquivo_foto(id_produto)
    if arquivo is None:
        return jsonify({"erro": "Este produto ainda não tem foto."}), 404
    return send_from_directory(str(PASTA_IMAGENS), arquivo.name)


@app.route("/produtos/<int:id_produto>/foto", methods=["POST"])
def enviar_foto(id_produto):
    if dao.buscar_por_id(id_produto) is None:
        return jsonify({"erro": "Produto não encontrado."}), 404

    enviado = request.files.get("foto")
    if enviado is None:
        return jsonify({"erro": "Escolha uma imagem para enviar."}), 400
    conteudo = enviado.read()
    extensao = tipo_da_imagem(conteudo)
    if extensao is None:
        return jsonify({"erro": "Envie uma imagem JPG, PNG ou WEBP."}), 400

    apagar_fotos(id_produto)
    (PASTA_IMAGENS / f"produto_{id_produto}.{extensao}").write_bytes(conteudo)
    return jsonify({"mensagem": "Foto atualizada.",
                    "produto": com_foto(dao.buscar_por_id(id_produto))})


@app.route("/produtos/<int:id_produto>/foto", methods=["DELETE"])
def remover_foto(id_produto):
    if dao.buscar_por_id(id_produto) is None:
        return jsonify({"erro": "Produto não encontrado."}), 404
    apagar_fotos(id_produto)
    return jsonify({"mensagem": "Foto removida.",
                    "produto": com_foto(dao.buscar_por_id(id_produto))})


# ---------- fornecedores ----------
@app.route("/api/fornecedores", methods=["GET"])
def listar_fornecedores():
    return jsonify(dao.listar_fornecedores())


@app.route("/api/fornecedores", methods=["POST"])
def criar_fornecedor():
    dados, erro = validar_fornecedor(corpo_json())
    if erro:
        return jsonify({"erro": erro}), 400
    try:
        criado = dao.inserir_fornecedor(Fornecedor(None, dados["nome"], dados["telefone"], dados["email"]))
    except NomeDuplicado:
        return jsonify({"erro": "Já existe um fornecedor com esse nome."}), 409
    return jsonify({"mensagem": f"“{criado['nome']}” foi cadastrado.", "fornecedor": criado}), 201


@app.route("/api/fornecedores/<int:id_fornecedor>", methods=["PUT"])
def atualizar_fornecedor(id_fornecedor):
    dados, erro = validar_fornecedor(corpo_json())
    if erro:
        return jsonify({"erro": erro}), 400
    try:
        atualizado = dao.atualizar_fornecedor(
            id_fornecedor, Fornecedor(id_fornecedor, dados["nome"], dados["telefone"], dados["email"]))
    except NomeDuplicado:
        return jsonify({"erro": "Já existe um fornecedor com esse nome."}), 409
    if atualizado is None:
        return jsonify({"erro": "Fornecedor não encontrado."}), 404
    return jsonify({"mensagem": f"As alterações em “{atualizado['nome']}” foram salvas.", "fornecedor": atualizado})


@app.route("/api/fornecedores/<int:id_fornecedor>", methods=["DELETE"])
def remover_fornecedor(id_fornecedor):
    try:
        removido = dao.remover_fornecedor(id_fornecedor)
    except RegistroEmUso as e:
        return jsonify({"erro": f"Este fornecedor tem {e.quantidade} produto(s) cadastrado(s) e não pode ser excluído."}), 409
    if not removido:
        return jsonify({"erro": "Fornecedor não encontrado."}), 404
    return jsonify({"mensagem": "Fornecedor excluído."})


# ---------- funcionários ----------
@app.route("/api/funcionarios", methods=["GET"])
def listar_funcionarios():
    return jsonify(dao.listar_funcionarios())


@app.route("/api/funcionarios", methods=["POST"])
def criar_funcionario():
    dados, erro = validar_funcionario(corpo_json())
    if erro:
        return jsonify({"erro": erro}), 400
    criado = dao.inserir_funcionario(Funcionario(None, dados["nome"], dados["cargo"]))
    return jsonify({"mensagem": f"“{criado['nome']}” foi cadastrado.", "funcionario": criado}), 201


@app.route("/api/funcionarios/<int:id_funcionario>", methods=["PUT"])
def atualizar_funcionario(id_funcionario):
    dados, erro = validar_funcionario(corpo_json())
    if erro:
        return jsonify({"erro": erro}), 400
    atualizado = dao.atualizar_funcionario(
        id_funcionario, Funcionario(id_funcionario, dados["nome"], dados["cargo"]))
    if atualizado is None:
        return jsonify({"erro": "Funcionário não encontrado."}), 404
    return jsonify({"mensagem": f"As alterações em “{atualizado['nome']}” foram salvas.", "funcionario": atualizado})


@app.route("/api/funcionarios/<int:id_funcionario>", methods=["DELETE"])
def remover_funcionario(id_funcionario):
    try:
        removido = dao.remover_funcionario(id_funcionario)
    except RegistroEmUso as e:
        return jsonify({"erro": f"Este funcionário tem {e.quantidade} movimentação(ões) no histórico e não pode ser excluído."}), 409
    if not removido:
        return jsonify({"erro": "Funcionário não encontrado."}), 404
    return jsonify({"mensagem": "Funcionário excluído."})


@app.errorhandler(TemplateNotFound)
def pagina_nao_encontrada(erro):
    pastas = "".join(f"<li><code>{pasta}</code></li>" for pasta in PASTAS_DO_SITE)
    return (f"<h1>Arquivo não encontrado: {erro.name}</h1>"
            "<p>O arquivo não está em nenhuma destas pastas (confira também se o nome está escrito certo):</p>"
            f"<ul>{pastas}</ul>"), 500


@app.errorhandler(413)
def arquivo_grande(_erro):
    return jsonify({"erro": "A imagem é grande demais (máximo 6 MB)."}), 413


@app.route("/movimentacoes", methods=["GET"])
def listar_movimentacoes():
    limite = request.args.get("limite", 50, type=int)
    return jsonify(dao.listar_movimentacoes(max(1, min(limite, 500))))


def avisar_arquivos_faltando():
    faltando = [nome for nome in ARQUIVOS_DO_SITE
                if not any((pasta / nome).is_file() for pasta in PASTAS_DO_SITE)]
    if faltando:
        print("\n*** ATENÇÃO: estes arquivos do site não foram encontrados: " + ", ".join(faltando))
        print("*** Copie-os para a mesma pasta do index.html. Pastas verificadas:")
        for pasta in PASTAS_DO_SITE:
            print("    " + str(pasta))
        print()


if __name__ == "__main__":
    avisar_arquivos_faltando()
    app.run(debug=True)