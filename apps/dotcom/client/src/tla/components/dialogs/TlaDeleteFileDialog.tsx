import { useAuth } from '@clerk/clerk-react'
import { TldrawAppFileId, TldrawAppFileRecordType } from '@tldraw/dotcom-shared'
import { useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
	TldrawUiButton,
	TldrawUiButtonLabel,
	TldrawUiDialogBody,
	TldrawUiDialogCloseButton,
	TldrawUiDialogFooter,
	TldrawUiDialogHeader,
	TldrawUiDialogTitle,
} from 'tldraw'
import { useApp } from '../../hooks/useAppState'
import { useIsFileOwner } from '../../hooks/useIsFileOwner'
import { useRaw } from '../../hooks/useRaw'

export function TlaDeleteFileDialog({
	fileId,
	onClose,
}: {
	fileId: TldrawAppFileId
	onClose(): void
}) {
	const app = useApp()
	const raw = useRaw()
	const location = useLocation()
	const navigate = useNavigate()
	const auth = useAuth()

	const isOwner = useIsFileOwner(fileId)

	const handleDelete = useCallback(async () => {
		const token = await auth.getToken()
		if (!token) throw new Error('No token')
		const result = await app.deleteOrForgetFile(fileId, token)
		if (result.ok) {
			if (location.pathname.endsWith(TldrawAppFileRecordType.parseId(fileId))) {
				navigate('/q')
			}
			onClose()
		} else {
			// ...um, show a error line in the dialog? try again?
		}
	}, [app, fileId, location.pathname, navigate, onClose, auth])

	return (
		<>
			<TldrawUiDialogHeader>
				<TldrawUiDialogTitle>{raw(isOwner ? 'Delete file' : 'Forget file')}</TldrawUiDialogTitle>
				<TldrawUiDialogCloseButton />
			</TldrawUiDialogHeader>
			<TldrawUiDialogBody style={{ maxWidth: 350 }}>
				<>{raw(`Are you sure you want to ${isOwner ? 'delete' : 'forget'} this file?`)}</>
			</TldrawUiDialogBody>
			<TldrawUiDialogFooter className="tlui-dialog__footer__actions">
				<TldrawUiButton type="normal" onClick={onClose}>
					<TldrawUiButtonLabel>{raw('Cancel')}</TldrawUiButtonLabel>
				</TldrawUiButton>
				<TldrawUiButton type="danger" onClick={handleDelete}>
					<TldrawUiButtonLabel>{raw(isOwner ? 'Delete' : 'Forget')}</TldrawUiButtonLabel>
				</TldrawUiButton>
			</TldrawUiDialogFooter>
		</>
	)
}
