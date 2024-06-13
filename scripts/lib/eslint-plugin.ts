/* eslint-disable @typescript-eslint/no-var-requires */

// eslint plugins can't use esm

// @ts-ignore - no import/require
import ts = require('typescript')
// @ts-ignore - no import/require
import utils = require('@typescript-eslint/utils')

const { isReassignmentTarget } = require('tsutils') as typeof import('tsutils')

const { ESLintUtils } = utils
import TSESTree = utils.TSESTree

exports.rules = {
	'no-export-star': ESLintUtils.RuleCreator.withoutDocs({
		create(context) {
			return {
				ExportAllDeclaration(node) {
					if (node.exported !== null) {
						// we're exporting a specific name, so that's OK!
						return
					}

					// 1. Grab the TypeScript program from parser services
					const parserServices = ESLintUtils.getParserServices(context)
					const checker = parserServices.program.getTypeChecker()

					// 2. Find the backing TS node for the ES node, then the symbol for the imported file
					const originalNode = parserServices.esTreeNodeToTSNodeMap.get(node)
					const importedFileSymbol = checker.getSymbolAtLocation(originalNode.moduleSpecifier!)!

					// 3. Find all the imported names from the file
					const importedNames = checker.getExportsOfModule(importedFileSymbol).map((imported) => ({
						name: imported.getEscapedName(),
						isType: !(imported.flags & ts.SymbolFlags.Value),
					}))

					// report the error and offer a fix (listing imported names)
					context.report({
						messageId: 'named',
						node,
						fix: (fixer) => {
							return fixer.replaceText(
								node,
								[
									'export {',
									...importedNames.map(
										(imported) => `  ${imported.isType ? 'type ' : ''}${imported.name},`
									),
									`} from ${JSON.stringify(node.source.value)};`,
								].join('\n')
							)
						},
					})
				},
			}
		},
		meta: {
			messages: {
				named: 'Use specific named exports instead of export *',
			},
			type: 'suggestion',
			schema: [],
			fixable: 'code',
		},
		defaultOptions: [],
	}),
	'no-internal-imports': ESLintUtils.RuleCreator.withoutDocs({
		create(context) {
			return {
				ImportDeclaration(node) {
					const path = node.source.value

					const parts = path.split('/')

					switch (parts[0]) {
						case 'tldraw':
							// 'tldraw'
							if (parts.length === 1) return
							// 'tldraw/**/*.css'
							if (path.endsWith('.css')) return
							break
						case '@tldraw':
							// '@tldraw/*'
							if (parts.length === 2) return
							// '@tldraw/**/*.css'
							if (path.endsWith('.css')) return
							// '@tldraw/assets/*'
							if (parts[1] === 'assets' && parts.length === 3) return
							break
						default:
							return
					}

					context.report({
						messageId: 'internal',
						node: node.source,
						data: { path },
					})
				},
			}
		},
		meta: {
			messages: {
				internal: "Don't import from internal tldraw source ({{path}})",
			},
			type: 'problem',
			schema: [],
		},
		defaultOptions: [],
	}),
	'no-at-internal': ESLintUtils.RuleCreator.withoutDocs({
		create(context) {
			// adapted from https://github.com/gund/eslint-plugin-deprecation

			function identifierRule(id: TSESTree.Identifier | TSESTree.JSXIdentifier) {
				const services = ESLintUtils.getParserServices(context)
				// Don't consider deprecations in certain cases:

				// - On JSX closing elements (only flag the opening element)
				const isClosingElement =
					id.type === 'JSXIdentifier' && id.parent?.type === 'JSXClosingElement'

				if (isClosingElement) {
					return
				}

				// - Inside an import
				const isInsideImport = context.getAncestors().some((anc) => anc.type.includes('Import'))

				if (isInsideImport) {
					return
				}

				const internalMarker = getInternalMarker(id, services)

				if (internalMarker) {
					context.report({
						node: id,
						messageId: 'internal',
						data: {
							name: id.name,
						},
					})
				}
			}

			function getInternalMarker(
				id: TSESTree.Identifier | TSESTree.JSXIdentifier,
				services: utils.ParserServices
			) {
				const tc = services.program.getTypeChecker()
				const callExpression = getCallExpression(id)

				if (callExpression) {
					const tsCallExpression = services.esTreeNodeToTSNodeMap.get(
						callExpression
					) as ts.CallLikeExpression
					const signature = tc.getResolvedSignature(tsCallExpression)
					if (signature) {
						const deprecation = getJsDocInternal(signature.getJsDocTags())
						if (deprecation) {
							return deprecation
						}
					}
				}

				const symbol = getSymbol(id, services, tc)

				if (!symbol) {
					return undefined
				}
				if (callExpression && isFunction(symbol)) {
					return undefined
				}

				return getJsDocInternal(symbol.getJsDocTags())
			}

			function isFunction(symbol: ts.Symbol) {
				const { declarations } = symbol
				if (declarations === undefined || declarations.length === 0) {
					return false
				}
				switch (declarations[0].kind) {
					case ts.SyntaxKind.MethodDeclaration:
					case ts.SyntaxKind.FunctionDeclaration:
					case ts.SyntaxKind.FunctionExpression:
					case ts.SyntaxKind.MethodSignature:
						return true
					default:
						return false
				}
			}

			function getCallExpression(
				id: TSESTree.Node
			): TSESTree.CallExpression | TSESTree.TaggedTemplateExpression | undefined {
				const ancestors = context.getAncestors()
				let callee = id
				let parent = ancestors.length > 0 ? ancestors[ancestors.length - 1] : undefined

				if (parent && parent.type === 'MemberExpression' && parent.property === id) {
					callee = parent
					parent = ancestors.length > 1 ? ancestors[ancestors.length - 2] : undefined
				}

				if (isCallExpression(parent, callee)) {
					return parent
				}
				return undefined
			}

			function isCallExpression(
				node: TSESTree.Node | undefined,
				callee: TSESTree.Node
			): node is TSESTree.CallExpression | TSESTree.TaggedTemplateExpression {
				if (node) {
					if (node.type === 'NewExpression' || node.type === 'CallExpression') {
						return node.callee === callee
					} else if (node.type === 'TaggedTemplateExpression') {
						return node.tag === callee
					} else if (node.type === 'JSXOpeningElement') {
						return node.name === callee
					}
				}
				return false
			}

			function getJsDocInternal(tags: ts.JSDocTagInfo[]) {
				for (const tag of tags) {
					if (tag.name === 'internal') {
						return { reason: ts.displayPartsToString(tag.text) }
					}
				}
				return undefined
			}

			function getSymbol(
				id: TSESTree.Identifier | TSESTree.JSXIdentifier,
				services: utils.ParserServices,
				tc: ts.TypeChecker
			) {
				let symbol: ts.Symbol | undefined
				const tsId = services.esTreeNodeToTSNodeMap.get(id as TSESTree.Node) as ts.Identifier
				const parent = tsId.parent

				if (parent.kind === ts.SyntaxKind.BindingElement) {
					symbol = tc.getTypeAtLocation(parent.parent).getProperty(tsId.text)
				} else if (
					(isPropertyAssignment(parent) && parent.name === tsId) ||
					(isShorthandPropertyAssignment(parent) &&
						parent.name === tsId &&
						isReassignmentTarget(tsId))
				) {
					try {
						symbol = tc.getPropertySymbolOfDestructuringAssignment(tsId)
					} catch (e) {
						// we are in object literal, not destructuring
						// no obvious easy way to check that in advance
						symbol = tc.getSymbolAtLocation(tsId)
					}
				} else {
					symbol = tc.getSymbolAtLocation(tsId)
				}

				if (symbol && (symbol.flags & ts.SymbolFlags.Alias) !== 0) {
					symbol = tc.getAliasedSymbol(symbol)
				}
				return symbol
			}

			function isPropertyAssignment(node: ts.Node): node is ts.PropertyAssignment {
				return node.kind === ts.SyntaxKind.PropertyAssignment
			}

			function isShorthandPropertyAssignment(
				node: ts.Node
			): node is ts.ShorthandPropertyAssignment {
				return node.kind === ts.SyntaxKind.ShorthandPropertyAssignment
			}

			return {
				Identifier: identifierRule,
				JSXIdentifier: identifierRule,
			}
		},
		meta: {
			messages: {
				internal: '"{{name}}" is internal and can\'t be used publicly.',
			},
			type: 'problem',
			schema: [],
		},
		defaultOptions: [],
	}),
	'tagged-components': ESLintUtils.RuleCreator.withoutDocs({
		create(context) {
			function isComponentName(node: TSESTree.Node) {
				return node.type === 'Identifier' && /^[A-Z]/.test(node.name)
			}

			function checkComponentDeclaration(
				services: utils.ParserServices,
				node: TSESTree.VariableDeclarator | TSESTree.FunctionDeclaration,
				propsType: ts.TypeNode | undefined
			) {
				const declaration = findTopLevelParent(node)
				const comments = context.getSourceCode().getCommentsBefore(declaration)

				// we only care about components tagged as public
				const publicComment = comments.find((comment) => comment.value.includes('@public'))
				if (!publicComment) return

				// if it's not tagged as a react component, it should be:
				if (!publicComment.value.includes('@react')) {
					context.report({
						messageId: 'untagged',
						node: publicComment,
						fix: (fixer) => {
							const hasLines = publicComment.value.includes('\n')
							let replacement
							if (hasLines) {
								const lines = publicComment.value.split('\n')
								const publicLineIdx = lines.findIndex((line) => line.includes('@public'))
								if (!publicLineIdx) throw new Error('Could not find @public line')
								const indent = lines[publicLineIdx].match(/^\s*/)![0]
								lines.splice(publicLineIdx + 1, 0, `${indent}* @react`)
								replacement = lines.join('\n')
							} else {
								replacement = publicComment.value.replace('@public', '@public @react')
							}

							return fixer.replaceText(publicComment, `/*${replacement}*/`)
						},
					})
					return
				}

				// if it is tagged as a react component, the props should be a named export:
				if (!propsType) return
				if (propsType.kind !== ts.SyntaxKind.TypeReference) {
					context.report({
						messageId: 'nonNamedProps',
						node: services.tsNodeToESTreeNodeMap.get(propsType)!,
					})
				}
			}

			function findTopLevelParent(node: TSESTree.Node): TSESTree.Node {
				let current: TSESTree.Node = node
				while (current.parent && current.parent.type !== 'Program') {
					current = current.parent
				}
				return current
			}

			function checkFunctionExpression(
				node: TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression
			) {
				const services = ESLintUtils.getParserServices(context)

				const parent = node.parent!
				if (parent.type === utils.AST_NODE_TYPES.VariableDeclarator && isComponentName(parent.id)) {
					const propsType = services.esTreeNodeToTSNodeMap.get(node).parameters[0]?.type
					checkComponentDeclaration(services, parent, propsType)
				}

				if (parent.type === utils.AST_NODE_TYPES.CallExpression) {
					const callee = parent.callee
					const grandparent = parent.parent!

					const isMemoFn =
						(callee.type === utils.AST_NODE_TYPES.Identifier && callee.name === 'memo') ||
						(callee.type === utils.AST_NODE_TYPES.MemberExpression &&
							callee.property.type === utils.AST_NODE_TYPES.Identifier &&
							callee.property.name === 'memo')

					const isForwardRefFn =
						(callee.type === utils.AST_NODE_TYPES.Identifier && callee.name === 'forwardRef') ||
						(callee.type === utils.AST_NODE_TYPES.MemberExpression &&
							callee.property.type === utils.AST_NODE_TYPES.Identifier &&
							callee.property.name === 'forwardRef')

					const isComponenty =
						grandparent.type === utils.AST_NODE_TYPES.VariableDeclarator &&
						isComponentName(grandparent.id)

					if (isMemoFn && isComponenty) {
						const propsType = services.esTreeNodeToTSNodeMap.get(node).parameters[0]?.type
						checkComponentDeclaration(services, grandparent, propsType)
					}

					if (isForwardRefFn && isComponenty) {
						const propsType =
							services.esTreeNodeToTSNodeMap.get(node).parameters[1]?.type ||
							services.esTreeNodeToTSNodeMap.get(parent).typeArguments?.[1]
						checkComponentDeclaration(services, grandparent, propsType)
					}
				}
			}

			return {
				FunctionDeclaration(node) {
					if (node.id && isComponentName(node.id)) {
						const services = ESLintUtils.getParserServices(context)
						const propsType = services.esTreeNodeToTSNodeMap.get(node).parameters[0]?.type
						checkComponentDeclaration(services, node, propsType)
					}
				},
				FunctionExpression(node) {
					checkFunctionExpression(node)
				},
				ArrowFunctionExpression(node) {
					checkFunctionExpression(node)
				},
			}
		},
		meta: {
			messages: {
				untagged: 'This react component should be tagged with @react',
				nonNamedProps: 'Props should be a separate named & public exported type/interface.',
			},
			type: 'problem',
			schema: [],
			fixable: 'code',
		},
		defaultOptions: [],
	}),
}
