# Chocomilka — Controle de Estoque

Projeto integrado de controle de estoque de chocolates.

## Estrutura
- `app.py`: aplicação Flask, rotas da API e validação dos dados.
- `models.py`: classes das 5 tabelas do DER (Categoria, Fornecedor, Funcionario, Produto, Movimentacao) e o SQL de criação.
- `dao.py`: operações SQLite pela classe ProdutoDAO.
- `index.html`: página principal (estoque).
- `catalogo.html` e `catalogo.js`: vitrine com a foto de cada produto (`/catalogo`).
- `imagens/`: fotos dos produtos (`produto_<id>.jpg`), criada automaticamente.
- `sobre.html`: página "Sobre o site" (`/sobre`).
- `style.css`: aparência da página.
- `script.js`: interação e chamadas Fetch.
- `database/`: banco SQLite criado automaticamente.
- `documentacao/`: descrição do projeto e diagramas.
- `requirements.txt`: dependências Python.

## Como executar
1. Abra esta pasta `Chocomilka` no VS Code.
2. No terminal, já dentro desta pasta, execute `python -m pip install -r requirements.txt`.
3. Execute `python app.py`.
4. Acesse `http://127.0.0.1:5000`.

O banco `database/chocomilka.db` é criado automaticamente na primeira execução. Se existir um banco do modelo antigo, os produtos são migrados e a tabela antiga fica guardada como `produtos_antigo`.

## Tecnologias
Python, Flask, SQLite, HTML, CSS e JavaScript (Fetch API).

## Melhorias de UX/UI

**Fluxo e usabilidade**
- A lista é o foco da tela; o cadastro e a edição abrem em um diálogo.
- Um resumo no topo mostra se há produtos para repor ("2 produtos precisam de reposição").
- Situação do estoque em cada produto: *Em estoque*, *Estoque baixo* ou *Sem estoque*.
- Botões **− / +** na própria lista ajustam a quantidade sem abrir o formulário.
- Filtros por situação, busca (ignora acentos) e ordenação por "precisa de atenção primeiro".
- Confirmação de exclusão que cita o nome do produto.
- Avisos (toast) no lugar da mensagem fixa; erros dizem o que corrigir.
- Estados de carregamento (esqueleto), lista vazia e erro, cada um com uma ação sugerida.
- Sugestão de categorias já cadastradas ao digitar.

**Interface**
- Paleta de cacau, framboesa e um detalhe dourado inspirado na embalagem.
- Fonte DM Sans e escala tipográfica consistente.
- No celular, a tabela vira uma lista de fichas.

**Acessibilidade**
- Link "pular para a lista", foco visível, alvos de toque de 44 px.
- Rótulos para leitores de tela, `aria-live`, `aria-invalid` e erro ao lado de cada campo.
- A situação usa ícone e texto, nunca só cor.
- Respeita `prefers-reduced-motion`.

## Melhorias de código
- `dao.py`: conexões SQLite agora são fechadas (antes só havia commit), `CHECK` no banco e novo método `ajustar_quantidade` (atômico, nunca abaixo de zero).
- `app.py`: validação única (`validar_produto`) no lugar de código duplicado no POST e no PUT; nova rota `PATCH /produtos/<id>/quantidade`.
- `models.py`: a propriedade `situacao` concentra a regra de negócio e vai no JSON.
- `script.js`: um único estado, delegação de eventos e função `chamarAPI` com tratamento de erro.