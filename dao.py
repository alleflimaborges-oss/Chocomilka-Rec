import sqlite3
from contextlib import contextmanager
from pathlib import Path
from models import Produto, Movimentacao, Fornecedor, Funcionario, CRIAR_TABELAS_SQL

PASTA_BACKEND = Path(__file__).resolve().parent
CAMINHO_BANCO = PASTA_BACKEND / "database" / "chocomilka.db"

NOME_FUNCIONARIO_PADRAO = "Funcionário padrão"
CARGO_FUNCIONARIO_PADRAO = "Estoquista"
FORNECEDOR_PADRAO = "Sem fornecedor"

# tabela -> coluna da chave primária (lista fixa: nunca vem do usuário)
TABELAS_NOMEADAS = {"categorias": "id_categoria", "fornecedores": "id_fornecedor"}

SELECT_PRODUTOS = """
    SELECT p.id_produto, p.nome, p.preco, p.quantidade_estoque, p.estoque_minimo,
           p.validade, p.id_categoria, p.id_fornecedor,
           c.nome AS categoria, f.nome AS fornecedor
    FROM produtos p
    JOIN categorias c ON c.id_categoria = p.id_categoria
    JOIN fornecedores f ON f.id_fornecedor = p.id_fornecedor
"""


class NomeDuplicado(Exception):
    """Já existe um registro com esse nome."""


class RegistroEmUso(Exception):
    """O registro está ligado a outros dados e não pode ser excluído."""

    def __init__(self, quantidade):
        super().__init__(quantidade)
        self.quantidade = quantidade


def _fornecedor_para_dict(linha):
    dados = Fornecedor(linha["id_fornecedor"], linha["nome"], linha["telefone"], linha["email"]).to_dict()
    dados["produtos"] = linha["produtos"]
    return dados


def _funcionario_para_dict(linha):
    dados = Funcionario(linha["id_funcionario"], linha["nome"], linha["cargo"]).to_dict()
    dados["movimentacoes"] = linha["movimentacoes"]
    return dados


def _produto_para_dict(linha):
    """Linha do SELECT_PRODUTOS -> dict do Produto + nomes de categoria e fornecedor."""
    produto = Produto(
        linha["id_produto"], linha["nome"], linha["preco"], linha["quantidade_estoque"],
        linha["estoque_minimo"], linha["validade"], linha["id_categoria"], linha["id_fornecedor"])
    dados = produto.to_dict()
    dados["categoria"] = linha["categoria"]
    dados["fornecedor"] = linha["fornecedor"]
    return dados


class ProdutoDAO:
    def __init__(self, caminho_banco=CAMINHO_BANCO):
        self.caminho_banco = str(caminho_banco)
        Path(self.caminho_banco).parent.mkdir(parents=True, exist_ok=True)
        self.criar_tabelas()

    @contextmanager
    def _conectar(self):
        """Abre a conexão, confirma (commit) ao final e SEMPRE a fecha."""
        conexao = sqlite3.connect(self.caminho_banco)
        conexao.row_factory = sqlite3.Row
        conexao.execute("PRAGMA foreign_keys = ON")  # o SQLite exige isso em cada conexão
        try:
            with conexao:
                yield conexao
        finally:
            conexao.close()

    # ---------- criação e migração ----------
    def criar_tabelas(self):
        with self._conectar() as conexao:
            antigo = self._guardar_tabela_antiga(conexao)
            conexao.executescript(CRIAR_TABELAS_SQL)
            if antigo:
                self._migrar_produtos_antigos(conexao)

    def _guardar_tabela_antiga(self, conexao):
        """Se existir a tabela `produtos` do esquema antigo, renomeia para `produtos_antigo`."""
        colunas = [l["name"] for l in conexao.execute("PRAGMA table_info(produtos)")]
        if colunas and "id_produto" not in colunas:
            conexao.execute("ALTER TABLE produtos RENAME TO produtos_antigo")
            return True
        return False

    def _migrar_produtos_antigos(self, conexao):
        """Copia os produtos antigos para o esquema novo (preço 0 e 'Sem fornecedor').
        A tabela `produtos_antigo` é mantida como cópia de segurança."""
        antigos = conexao.execute(
            "SELECT nome, categoria, quantidade, estoque_minimo FROM produtos_antigo").fetchall()
        for a in antigos:
            id_categoria = self._obter_ou_criar(conexao, "categorias", a["categoria"])
            id_fornecedor = self._obter_ou_criar(conexao, "fornecedores", FORNECEDOR_PADRAO)
            cursor = conexao.execute("""
                INSERT INTO produtos (nome, preco, quantidade_estoque, estoque_minimo,
                                      validade, id_categoria, id_fornecedor)
                VALUES (?, 0, ?, ?, NULL, ?, ?)
            """, (a["nome"], a["quantidade"], a["estoque_minimo"], id_categoria, id_fornecedor))
            self._registrar_movimentacao(conexao, cursor.lastrowid, a["quantidade"],
                                         "Migração do estoque anterior")

    # ---------- auxiliares ----------
    def _obter_ou_criar(self, conexao, tabela, nome):
        coluna_id = TABELAS_NOMEADAS[tabela]
        linha = conexao.execute(
            f"SELECT {coluna_id} FROM {tabela} WHERE nome = ? COLLATE NOCASE", (nome,)).fetchone()
        if linha:
            return linha[0]
        return conexao.execute(f"INSERT INTO {tabela} (nome) VALUES (?)", (nome,)).lastrowid

    def _funcionario_padrao(self, conexao):
        linha = conexao.execute(
            "SELECT id_funcionario FROM funcionarios WHERE nome = ?",
            (NOME_FUNCIONARIO_PADRAO,)).fetchone()
        if linha:
            return linha[0]
        return conexao.execute(
            "INSERT INTO funcionarios (nome, cargo) VALUES (?, ?)",
            (NOME_FUNCIONARIO_PADRAO, CARGO_FUNCIONARIO_PADRAO)).lastrowid

    def _registrar_movimentacao(self, conexao, id_produto, variacao, observacao):
        """Grava entrada (variação > 0) ou saída (variação < 0). Variação 0 não grava nada."""
        if variacao == 0:
            return
        conexao.execute("""
            INSERT INTO movimentacoes (tipo, quantidade, observacao, id_funcionario, id_produto)
            VALUES (?, ?, ?, ?, ?)
        """, ("entrada" if variacao > 0 else "saida", abs(variacao), observacao,
              self._funcionario_padrao(conexao), id_produto))

    def _buscar(self, conexao, id_produto):
        linha = conexao.execute(SELECT_PRODUTOS + " WHERE p.id_produto = ?", (id_produto,)).fetchone()
        return _produto_para_dict(linha) if linha else None

    # ---------- produtos ----------
    def buscar_todos(self):
        with self._conectar() as conexao:
            linhas = conexao.execute(SELECT_PRODUTOS + " ORDER BY p.id_produto DESC").fetchall()
            return [_produto_para_dict(l) for l in linhas]

    def buscar_por_id(self, id_produto):
        with self._conectar() as conexao:
            return self._buscar(conexao, id_produto)

    def inserir(self, produto, categoria, fornecedor):
        with self._conectar() as conexao:
            id_categoria = self._obter_ou_criar(conexao, "categorias", categoria)
            id_fornecedor = self._obter_ou_criar(conexao, "fornecedores", fornecedor)
            cursor = conexao.execute("""
                INSERT INTO produtos (nome, preco, quantidade_estoque, estoque_minimo,
                                      validade, id_categoria, id_fornecedor)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (produto.nome, produto.preco, produto.quantidade_estoque,
                  produto.estoque_minimo, produto.validade, id_categoria, id_fornecedor))
            self._registrar_movimentacao(conexao, cursor.lastrowid,
                                         produto.quantidade_estoque, "Estoque inicial")
            return cursor.lastrowid

    def atualizar(self, id_produto, produto, categoria, fornecedor):
        with self._conectar() as conexao:
            atual = conexao.execute(
                "SELECT quantidade_estoque FROM produtos WHERE id_produto = ?",
                (id_produto,)).fetchone()
            if atual is None:
                return False
            id_categoria = self._obter_ou_criar(conexao, "categorias", categoria)
            id_fornecedor = self._obter_ou_criar(conexao, "fornecedores", fornecedor)
            conexao.execute("""
                UPDATE produtos
                SET nome = ?, preco = ?, quantidade_estoque = ?, estoque_minimo = ?,
                    validade = ?, id_categoria = ?, id_fornecedor = ?
                WHERE id_produto = ?
            """, (produto.nome, produto.preco, produto.quantidade_estoque,
                  produto.estoque_minimo, produto.validade, id_categoria, id_fornecedor,
                  id_produto))
            self._registrar_movimentacao(conexao, id_produto,
                                         produto.quantidade_estoque - atual[0], "Edição manual")
            return True

    def ajustar_quantidade(self, id_produto, variacao):
        """Soma/subtrai sem deixar abaixo de zero e registra a movimentação.
        Devolve o produto atualizado ou None se o id não existir."""
        with self._conectar() as conexao:
            atual = conexao.execute(
                "SELECT quantidade_estoque FROM produtos WHERE id_produto = ?",
                (id_produto,)).fetchone()
            if atual is None:
                return None
            nova = max(0, atual[0] + variacao)
            conexao.execute("UPDATE produtos SET quantidade_estoque = ? WHERE id_produto = ?",
                            (nova, id_produto))
            self._registrar_movimentacao(conexao, id_produto, nova - atual[0], "Ajuste rápido")
            return self._buscar(conexao, id_produto)

    def remover(self, id_produto):
        """Apaga o produto e o histórico dele (a chave estrangeira exige essa ordem)."""
        with self._conectar() as conexao:
            conexao.execute("DELETE FROM movimentacoes WHERE id_produto = ?", (id_produto,))
            cursor = conexao.execute("DELETE FROM produtos WHERE id_produto = ?", (id_produto,))
            return cursor.rowcount > 0

    # ---------- fornecedores ----------
    SELECT_FORNECEDORES = """
        SELECT f.id_fornecedor, f.nome, f.telefone, f.email, COUNT(p.id_produto) AS produtos
        FROM fornecedores f
        LEFT JOIN produtos p ON p.id_fornecedor = f.id_fornecedor
    """

    def _nome_em_uso(self, conexao, tabela, nome, ignorar_id=0):
        coluna_id = TABELAS_NOMEADAS[tabela]
        linha = conexao.execute(
            f"SELECT 1 FROM {tabela} WHERE nome = ? COLLATE NOCASE AND {coluna_id} != ?",
            (nome, ignorar_id)).fetchone()
        return linha is not None

    def _buscar_fornecedor(self, conexao, id_fornecedor):
        linha = conexao.execute(
            self.SELECT_FORNECEDORES + " WHERE f.id_fornecedor = ? GROUP BY f.id_fornecedor",
            (id_fornecedor,)).fetchone()
        return _fornecedor_para_dict(linha) if linha else None

    def listar_fornecedores(self):
        with self._conectar() as conexao:
            linhas = conexao.execute(
                self.SELECT_FORNECEDORES + " GROUP BY f.id_fornecedor ORDER BY f.nome COLLATE NOCASE"
            ).fetchall()
            return [_fornecedor_para_dict(l) for l in linhas]

    def inserir_fornecedor(self, fornecedor):
        with self._conectar() as conexao:
            if self._nome_em_uso(conexao, "fornecedores", fornecedor.nome):
                raise NomeDuplicado()
            cursor = conexao.execute(
                "INSERT INTO fornecedores (nome, telefone, email) VALUES (?, ?, ?)",
                (fornecedor.nome, fornecedor.telefone, fornecedor.email))
            return self._buscar_fornecedor(conexao, cursor.lastrowid)

    def atualizar_fornecedor(self, id_fornecedor, fornecedor):
        """Devolve o fornecedor atualizado ou None se o id não existir."""
        with self._conectar() as conexao:
            if self._buscar_fornecedor(conexao, id_fornecedor) is None:
                return None
            if self._nome_em_uso(conexao, "fornecedores", fornecedor.nome, id_fornecedor):
                raise NomeDuplicado()
            conexao.execute(
                "UPDATE fornecedores SET nome = ?, telefone = ?, email = ? WHERE id_fornecedor = ?",
                (fornecedor.nome, fornecedor.telefone, fornecedor.email, id_fornecedor))
            return self._buscar_fornecedor(conexao, id_fornecedor)

    def remover_fornecedor(self, id_fornecedor):
        with self._conectar() as conexao:
            usados = conexao.execute(
                "SELECT COUNT(*) FROM produtos WHERE id_fornecedor = ?", (id_fornecedor,)).fetchone()[0]
            if usados:
                raise RegistroEmUso(usados)
            cursor = conexao.execute("DELETE FROM fornecedores WHERE id_fornecedor = ?", (id_fornecedor,))
            return cursor.rowcount > 0

    # ---------- funcionários ----------
    SELECT_FUNCIONARIOS = """
        SELECT f.id_funcionario, f.nome, f.cargo, COUNT(m.id_movimentacao) AS movimentacoes
        FROM funcionarios f
        LEFT JOIN movimentacoes m ON m.id_funcionario = f.id_funcionario
    """

    def _buscar_funcionario(self, conexao, id_funcionario):
        linha = conexao.execute(
            self.SELECT_FUNCIONARIOS + " WHERE f.id_funcionario = ? GROUP BY f.id_funcionario",
            (id_funcionario,)).fetchone()
        return _funcionario_para_dict(linha) if linha else None

    def listar_funcionarios(self):
        with self._conectar() as conexao:
            linhas = conexao.execute(
                self.SELECT_FUNCIONARIOS + " GROUP BY f.id_funcionario ORDER BY f.nome COLLATE NOCASE"
            ).fetchall()
            return [_funcionario_para_dict(l) for l in linhas]

    def inserir_funcionario(self, funcionario):
        with self._conectar() as conexao:
            cursor = conexao.execute(
                "INSERT INTO funcionarios (nome, cargo) VALUES (?, ?)",
                (funcionario.nome, funcionario.cargo))
            return self._buscar_funcionario(conexao, cursor.lastrowid)

    def atualizar_funcionario(self, id_funcionario, funcionario):
        """Devolve o funcionário atualizado ou None se o id não existir."""
        with self._conectar() as conexao:
            if self._buscar_funcionario(conexao, id_funcionario) is None:
                return None
            conexao.execute(
                "UPDATE funcionarios SET nome = ?, cargo = ? WHERE id_funcionario = ?",
                (funcionario.nome, funcionario.cargo, id_funcionario))
            return self._buscar_funcionario(conexao, id_funcionario)

    def remover_funcionario(self, id_funcionario):
        with self._conectar() as conexao:
            usados = conexao.execute(
                "SELECT COUNT(*) FROM movimentacoes WHERE id_funcionario = ?", (id_funcionario,)).fetchone()[0]
            if usados:
                raise RegistroEmUso(usados)
            cursor = conexao.execute("DELETE FROM funcionarios WHERE id_funcionario = ?", (id_funcionario,))
            return cursor.rowcount > 0

    # ---------- movimentações ----------
    def listar_movimentacoes(self, limite=50):
        with self._conectar() as conexao:
            linhas = conexao.execute("""
                SELECT m.*, p.nome AS produto, f.nome AS funcionario
                FROM movimentacoes m
                JOIN produtos p ON p.id_produto = m.id_produto
                JOIN funcionarios f ON f.id_funcionario = m.id_funcionario
                ORDER BY m.id_movimentacao DESC LIMIT ?
            """, (limite,)).fetchall()
            resultado = []
            for l in linhas:
                dados = Movimentacao(
                    l["id_movimentacao"], l["tipo"], l["quantidade"], l["data_movimentacao"],
                    l["observacao"], l["id_funcionario"], l["id_produto"]).to_dict()
                dados["produto"] = l["produto"]
                dados["funcionario"] = l["funcionario"]
                resultado.append(dados)
            return resultado