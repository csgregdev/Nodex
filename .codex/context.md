# Codex Context
Generated: 2026-05-03T17:32:37.245Z
Files: 36 | Symbols: 147 | Edges: 74

## Project Structure

### index.ts
  module: [index.ts]|exports:

### src/api/server.ts
  module: [src/api/server.ts]|exports:startAPIServer
  fn: startAPIServer(root,port)

### src/cli/init.ts
  module: [src/cli/init.ts]|exports:runInit
  fn: runInit(args)
  fn: generateContextMd(root)

### src/cli/main.ts
  module: [src/cli/main.ts]|exports:

### src/cli/reindex.ts
  module: [src/cli/reindex.ts]|exports:runReindex
  fn: runReindex(args)

### src/cli/search.ts
  module: [src/cli/search.ts]|exports:runSearch
  fn: runSearch(args)

### src/cli/summarize.ts
  module: [src/cli/summarize.ts]|exports:runSummarize
  fn: runSummarize(args)
  fn: regenerateContextMd(root)

### src/cli/sync.ts
  module: [src/cli/sync.ts]|exports:runSync
  fn: runSync(args)

### src/cli/ui.ts
  module: [src/cli/ui.ts]|exports:runUI
  fn: runUI(args)

### src/cli/watch.ts
  module: [src/cli/watch.ts]|exports:runWatch
  fn: runWatch(args)

### src/indexer/differ.ts
  module: [src/indexer/differ.ts]|exports:fileHash
  fn: fileHash(absolutePath)→Promise<string>

### src/indexer/graph.ts
  module: [src/indexer/graph.ts]|exports:indexFile
  fn: indexFile(parsed,fileHash)→void
  fn: generateToken(sym)→string
  fn: resolveRelativePath(fromDir,importPath)→string

### src/indexer/languages/index.ts
  interface: ILanguageConfig
  module: [src/indexer/languages/index.ts]|exports:LanguageConfig,LANGUAGES,detectLanguage,detectFramework
  const: const:LANGUAGES
  fn: detectLanguage(filePath)→LanguageConfig | null
  fn: detectFramework(filePath,lang)→string | null

### src/indexer/parser.ts
  interface: IParsedSymbol
  module: [src/indexer/parser.ts]|fw:react|exports:ParsedSymbol,ParsedImport,ParsedFile
  interface: IParsedImport
  interface: IParsedFile
  fn: detectFrameworkMetadata(content,file)→string[]
  fn: parseTypeScriptAST(tree,content,file,language)→ParsedFile
  fn: visitChildren(node)
  fn: isNodeExported(node)→boolean
  fn: extractParams(node)→string[]
  fn: parseTypeScriptRegex(content,file,language)→ParsedFile
  fn: parseParams(raw)→string[]
  fn: estimateComplexity(lines,startLine)→number
  fn: estimateComplexityLines(lines,startRow,endRow)→number
  fn: parsePython(content,file)→Promise<ParsedFile>
  fn: parsePythonAST(tree,content,file)→ParsedFile
  fn: extractPythonParams(paramsNode)→string[]
  fn: parsePythonRegex(content,file)→ParsedFile
  fn: parsePythonParamsRegex(raw)→string[]
  fn: parseGo(content,file)→Promise<ParsedFile>
  fn: parseGoAST(tree,content,file)→ParsedFile
  fn: visit(node)
  fn: extractGoParams(paramsNode)→string[]
  fn: parseGoRegex(content,file)→ParsedFile
  fn: parseDart(content,file)→ParsedFile
  fn: parseAstro(content,file)→ParsedFile
  fn: parseRust(content,file)→ParsedFile
  fn: parseJava(content,file)→ParsedFile
  fn: parseKotlin(content,file)→ParsedFile
  fn: parseRuby(content,file)→ParsedFile
  fn: parsePHP(content,file)→ParsedFile
  fn: parseGeneric(content,file,language)→ParsedFile

### src/indexer/walker.ts
  module: [src/indexer/walker.ts]|exports:WalkedFile,walkProject
  interface: IWalkedFile
  fn: walkProject(root)→AsyncGenerator<WalkedFile>
  fn: walkDir(root,dir,ig)→AsyncGenerator<WalkedFile>

### src/mcp/server.ts
  module: [src/mcp/server.ts]|exports:
  fn: main()

### src/mcp/tools/context.ts
  module: [src/mcp/tools/context.ts]|exports:contextToolDef,contextTool
  const: const:contextToolDef
  fn: contextTool(input)

### src/mcp/tools/conventions.ts
  module: [src/mcp/tools/conventions.ts]|exports:conventionsToolDef,conventionsTool
  const: const:conventionsToolDef
  fn: conventionsTool(_input)

### src/mcp/tools/decision.ts
  module: [src/mcp/tools/decision.ts]|exports:decisionToolDef,decisionTool
  const: const:decisionToolDef
  fn: decisionTool(input)

### src/mcp/tools/impact.ts
  module: [src/mcp/tools/impact.ts]|exports:impactToolDef,impactTool
  const: const:impactToolDef
  fn: impactTool(input)

### src/mcp/tools/search.ts
  module: [src/mcp/tools/search.ts]|exports:searchToolDef,searchTool
  const: const:searchToolDef
  fn: searchTool(input)

### src/mcp/tools/update.ts
  module: [src/mcp/tools/update.ts]|exports:updateToolDef,updateTool
  const: const:updateToolDef
  fn: updateTool(input)

### src/store/db.ts
  module: [src/store/db.ts]|exports:initDB,getDB
  fn: initDB(projectRoot)→Database
  fn: getDB()→Database

### src/store/edges.ts
  module: [src/store/edges.ts]|exports:Edge,insertEdge,deleteEdgesByFile,getEdgesFrom,getEdgesTo,getAllEdges
  interface: IEdge
  fn: insertEdge(edge)→void
  fn: deleteEdgesByFile(file)→void
  fn: getEdgesFrom(nodeId)→Edge[]
  fn: getEdgesTo(nodeId)→Edge[]
  fn: getAllEdges()→Edge[]

### src/store/meta.ts
  module: [src/store/meta.ts]|exports:Meta,addMeta,getMetaByNode,deleteMetaByNode,getProject,setProject
  interface: IMeta
  fn: addMeta(meta)→void
  fn: getMetaByNode(nodeId)→Meta[]
  fn: deleteMetaByNode(nodeId)→void
  fn: getProject(key)→string | null
  fn: setProject(key,value)→void

### src/store/nodes.ts
  module: [src/store/nodes.ts]|exports:Node,upsertNode,getNode,getNodesByFile,deleteNodesByFile,getAllNodes,searchNodes
  interface: INode
  fn: upsertNode(node)→void
  fn: getNode(id)→Node | null
  fn: getNodesByFile(file)→Node[]
  fn: deleteNodesByFile(file)→void
  fn: getAllNodes()→Node[]
  fn: searchNodes(query,limit)→Node[]

### src/summarizer/ai.ts
  module: [src/summarizer/ai.ts]|exports:ModuleSummaryResult,summarizeModule,summarizeModules
  fn: getClient()→Anthropic
  interface: IModuleSummaryResult
  fn: summarizeModule(file,language,nodes,sourceSnippet)→Promise<ModuleSummaryResult>
  fn: summarizeModules(modules,concurrency)→AsyncGenerator<{ file: string; result: ModuleSummaryResult }>

### src/summarizer/cache.ts
  module: [src/summarizer/cache.ts]|exports:needsAISummary,markAISummarized
  fn: needsAISummary(nodeId,currentHash)→boolean
  fn: markAISummarized(nodeId,hash)→void

### src/summarizer/formatter.ts
  module: [src/summarizer/formatter.ts]|exports:formatToken,formatModuleSummary
  fn: formatToken(node,callers,callees)→string
  fn: formatModuleSummary(file,nodes,exports)→string

### src/watcher/fswatch.ts
  module: [src/watcher/fswatch.ts]|exports:startWatcher
  fn: startWatcher(root)→void
  fn: reindexFile(root,absolutePath)→Promise<void>

### ui/src/App.tsx
  module: [ui/src/App.tsx]|fw:react|exports:GraphNode,GraphEdge
  interface: IGraphNode
  interface: IGraphEdge
  fn: App()

### ui/src/components/Graph.tsx
  module: [ui/src/components/Graph.tsx]|fw:react|exports:GraphView
  fn: CodexNode({ data, selected })
  fn: autoLayout(nodes,edges)→RFNode[]
  interface: IGraphViewProps
  fn: GraphViewInner({ searchQuery, selectedNodeId, impactNodeId, onNodeSelect })
  fn: GraphView(props)

### ui/src/components/NodePanel.tsx
  module: [ui/src/components/NodePanel.tsx]|fw:react|exports:NodePanel
  interface: INodeData
  interface: INodePanelProps
  fn: NodePanel({ nodeId, onClose, onImpact, impactActive })

### ui/src/components/SearchBar.tsx
  module: [ui/src/components/SearchBar.tsx]|fw:react|exports:SearchBar
  interface: ISearchResult
  interface: ISearchBarProps
  fn: SearchBar({ query, onQueryChange, onNodeSelect })

### ui/src/components/StatsBar.tsx
  module: [ui/src/components/StatsBar.tsx]|fw:react|exports:StatsBar
  interface: IStats
  fn: StatsBar()

### ui/src/styles/global.css
  module: [ui/src/styles/global.css]|exports:
