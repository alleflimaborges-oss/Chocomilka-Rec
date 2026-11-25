"""Modelos do banco de dados da Chocomilka, conforme o DER.

Relacionamentos (cardinalidades do diagrama):
- categorias  (1,n) ── produtos      (1,1): uma categoria tem vários produtos; cada produto tem uma categoria.
- fornecedores(1,n) ── produtos      (1,1): um fornecedor tem vários produtos; cada produto tem um fornecedor.
- produtos    (1,n) ── movimentacoes (1,1): um produto tem várias movimentações; cada movimentação é de um produto.
- funcionarios(1,n) ── movimentacoes (1,1): cada movimentação é registrada por um funcionário (id_funcionario).
"""

TIPOS_MOVIMENTACAO = ("entrada", "saida")


class Categoria:
    def __init__(self, id_categoria, nome):
        self.id_categoria = id_categoria
        self.nome = nome

    def to_dict(self):
        return {
            "id_categoria": self.id_categoria,
            "nome": self.nome,
        }


class Fornecedor:
    def __init__(self, id_fornecedor, nome, telefone, email):
        self.id_fornecedor = id_fornecedor
        self.nome = nome
        self.telefone = telefone
        self.email = email

    def to_dict(self):
        return {
            "id_fornecedor": self.id_fornecedor,
            "nome": self.nome,
            "telefone": self.telefone,
            "email": self.email,
        }


class Funcionario:
    def __init__(self, id_funcionario, nome, cargo):
        self.id_funcionario = id_funcionario
        self.nome = nome
        self.cargo = cargo

    def to_dict(self):
        return {
            "id_funcionario": self.id_funcionario,
            "nome": self.nome,
            "cargo": self.cargo,
        }


class Produto:
    def __init__(self, id_produto, nome, preco, quantidade_estoque, estoque_minimo,
                 validade, id_categoria, id_fornecedor):
        self.id_produto = id_produto
        self.nome = nome
        self.preco = preco
        self.quantidade_estoque = quantidade_estoque
        self.estoque_minimo = estoque_minimo
        self.validade = validade              # texto "AAAA-MM-DD" (ou None)
        self.id_categoria = id_categoria      # FK -> categorias
        self.id_fornecedor = id_fornecedor    # FK -> fornecedores

    @property
    def situacao(self):
        """Regra de negócio: 'sem_estoque', 'baixo' ou 'ok'."""
        if self.quantidade_estoque == 0:
            return "sem_estoque"
        if self.quantidade_estoque <= self.estoque_minimo:
            return "baixo"
        return "ok"

    def to_dict(self):
        return {
            "id_produto": self.id_produto,
            "nome": self.nome,
            "preco": self.preco,
            "quantidade_estoque": self.quantidade_estoque,
            "estoque_minimo": self.estoque_minimo,
            "validade": self.validade,
            "id_categoria": self.id_categoria,
            "id_fornecedor": self.id_fornecedor,
            "situacao": self.situacao,
        }


class Movimentacao:
    def __init__(self, id_movimentacao, tipo, quantidade, data_movimentacao,
                 observacao, id_funcionario, id_produto):
        self.id_movimentacao = id_movimentacao
        self.tipo = tipo                            # "entrada" ou "saida"
        self.quantidade = quantidade
        self.data_movimentacao = data_movimentacao  # texto "AAAA-MM-DD HH:MM:SS"
        self.observacao = observacao
        self.id_funcionario = id_funcionario        # FK -> funcionarios
        self.id_produto = id_produto                # FK -> produtos

    def to_dict(self):
        return {
            "id_movimentacao": self.id_movimentacao,
            "tipo": self.tipo,
            "quantidade": self.quantidade,
            "data_movimentacao": self.data_movimentacao,
            "observacao": self.observacao,
            "id_funcionario": self.id_funcionario,
            "id_produto": self.id_produto,
        }


# Criação das tabelas (use com conexao.executescript(CRIAR_TABELAS_SQL)).
# No SQLite, as chaves estrangeiras só são checadas se, em CADA conexão,
# for executado antes: PRAGMA foreign_keys = ON;
CRIAR_TABELAS_SQL = """
CREATE TABLE IF NOT EXISTS categorias (
    id_categoria INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS fornecedores (
    id_fornecedor INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    telefone TEXT,
    email TEXT
);

CREATE TABLE IF NOT EXISTS funcionarios (
    id_funcionario INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    cargo TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS produtos (
    id_produto INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    preco REAL NOT NULL CHECK (preco >= 0),
    quantidade_estoque INTEGER NOT NULL CHECK (quantidade_estoque >= 0),
    estoque_minimo INTEGER NOT NULL CHECK (estoque_minimo >= 0),
    validade TEXT,
    id_categoria INTEGER NOT NULL,
    id_fornecedor INTEGER NOT NULL,
    FOREIGN KEY (id_categoria) REFERENCES categorias (id_categoria),
    FOREIGN KEY (id_fornecedor) REFERENCES fornecedores (id_fornecedor)
);

CREATE TABLE IF NOT EXISTS movimentacoes (
    id_movimentacao INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT NOT NULL CHECK (tipo IN ('entrada', 'saida')),
    quantidade INTEGER NOT NULL CHECK (quantidade > 0),
    data_movimentacao TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    observacao TEXT,
    id_funcionario INTEGER NOT NULL,
    id_produto INTEGER NOT NULL,
    FOREIGN KEY (id_funcionario) REFERENCES funcionarios (id_funcionario),
    FOREIGN KEY (id_produto) REFERENCES produtos (id_produto)
);
"""