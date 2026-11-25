# Chocomilka — Controle de Estoque

**Integrantes:** Allef e Felipe  
**Tema:** Sistema web para cadastro e controle de estoque de produtos de uma loja de chocolates.

## Objetivo
Permitir cadastrar, consultar, editar e excluir produtos, acompanhando quantidade disponível, estoque mínimo e localização.

## Dados de cada produto
- Nome
- Categoria
- Quantidade
- Estoque mínimo
- Localização

## Operações CRUD
- **Create:** cadastrar produto.
- **Read:** listar e pesquisar produtos.
- **Update:** editar os dados de um produto.
- **Delete:** excluir produto.

## Organização técnica
- `backend/models.py`: classe Produto.
- `backend/dao.py`: operações SQLite pela classe ProdutoDAO.
- `backend/app.py`: aplicação Flask e rotas da API.
- `frontend/templates/index.html`: estrutura da página.
- `frontend/static/css/style.css`: aparência.
- `frontend/static/js/script.js`: interação e chamadas Fetch.
- `backend/database/`: arquivo SQLite criado automaticamente.

## Como executar
1. Instale Python 3.
2. Abra um terminal na pasta `backend`.
3. Instale as dependências: `python -m pip install -r requirements.txt`.
4. Inicie: `python app.py`.
5. Acesse `http://127.0.0.1:5000`.

O banco `chocomilka.db` é criado automaticamente na primeira execução.

## Tecnologias
Python, Flask, SQLite, HTML, CSS e JavaScript (Fetch API).
