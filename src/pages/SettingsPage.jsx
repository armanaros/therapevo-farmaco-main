import { useState, useEffect } from 'react';
import {
	Box, Typography, Tabs, Tab, TextField, Button, Stack, Card,
	CardContent, IconButton, Divider, Alert, Chip, CircularProgress,
} from '@mui/material';
import { Settings, FolderZip, Campaign, Delete, Send } from '@mui/icons-material';
import AppLayout from '@/components/layout/AppLayout';
import DataManagementPage from './DataManagementPage';
import useAuth from '@/hooks/useAuth';
import {
	createAnnouncement,
	deleteAnnouncement,
	subscribeToAnnouncements,
} from '@/services/announcement.service';
import toast from 'react-hot-toast';

function AnnouncementsTab() {
	const { user, isAdmin, isSuperAdmin } = useAuth();
	const canPost = isAdmin?.() || isSuperAdmin?.();

	const [announcements, setAnnouncements] = useState([]);
	const [title, setTitle] = useState('');
	const [message, setMessage] = useState('');
	const [posting, setPosting] = useState(false);
	const [deletingId, setDeletingId] = useState(null);

	useEffect(() => {
		const unsub = subscribeToAnnouncements((data) => setAnnouncements(data));
		return unsub;
	}, []);

	const handlePost = async () => {
		if (!message.trim()) {
			toast.error('Message is required.');
			return;
		}
		setPosting(true);
		try {
			await createAnnouncement({
				title: title.trim(),
				message: message.trim(),
				createdBy: user?.uid || '',
				authorName: [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.displayName || 'Admin',
			});
			toast.success('Announcement posted.');
			setTitle('');
			setMessage('');
		} catch (err) {
			toast.error(err.message || 'Failed to post announcement.');
		} finally {
			setPosting(false);
		}
	};

	const handleDelete = async (id) => {
		setDeletingId(id);
		try {
			await deleteAnnouncement(id);
			toast.success('Announcement deleted.');
		} catch (err) {
			toast.error(err.message || 'Failed to delete announcement.');
		} finally {
			setDeletingId(null);
		}
	};

	return (
		<Box sx={{ maxWidth: 720 }}>
			{canPost ? (
				<Card variant="outlined" sx={{ borderRadius: 2, mb: 3 }}>
					<CardContent>
						<Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2 }}>
							Post New Announcement
						</Typography>
						<Stack spacing={2}>
							<TextField
								label="Title (optional)"
								value={title}
								onChange={(e) => setTitle(e.target.value)}
								size="small"
								fullWidth
								inputProps={{ maxLength: 120 }}
							/>
							<TextField
								label="Message"
								value={message}
								onChange={(e) => setMessage(e.target.value)}
								size="small"
								fullWidth
								multiline
								rows={5}
								inputProps={{ maxLength: 1000 }}
								sx={{ '& .MuiInputBase-inputMultiline': { overflowY: 'auto !important', resize: 'none' } }}
							/>
							<Box>
								<Button
									variant="contained"
									startIcon={posting ? <CircularProgress size={16} color="inherit" /> : <Send />}
									onClick={handlePost}
									disabled={posting || !message.trim()}
								>
									{posting ? 'Posting…' : 'Post Announcement'}
								</Button>
							</Box>
						</Stack>
					</CardContent>
				</Card>
			) : (
				<Alert severity="info" sx={{ mb: 3 }}>
					Only administrators can post announcements.
				</Alert>
			)}

			<Typography variant="subtitle2" fontWeight={700} color="text.secondary" sx={{ mb: 1.5 }}>
				{announcements.length === 0 ? 'No announcements yet' : `${announcements.length} announcement${announcements.length !== 1 ? 's' : ''}`}
			</Typography>

			<Stack spacing={1.5}>
				{announcements.map((ann) => (
					<Card key={ann.id} variant="outlined" sx={{ borderRadius: 2 }}>
						<CardContent sx={{ pb: '12px !important' }}>
							<Stack direction="row" alignItems="flex-start" spacing={1}>
								<Box flex={1}>
									{ann.title && (
										<Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.5 }}>
											{ann.title}
										</Typography>
									)}
									<Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
										{ann.message}
									</Typography>
									<Divider sx={{ my: 1 }} />
									<Stack direction="row" spacing={1} alignItems="center">
								<Chip
									label={ann.authorName?.includes('@') ? 'Admin' : ann.authorName || 'Admin'}
									size="small"
									variant="outlined"
								/>
										{ann.createdAt?.toDate && (
											<Typography variant="caption" color="text.secondary">
												{ann.createdAt.toDate().toLocaleString()}
											</Typography>
										)}
									</Stack>
								</Box>
								{canPost && (
									<IconButton
										size="small"
										color="error"
										onClick={() => handleDelete(ann.id)}
										disabled={deletingId === ann.id}
									>
										{deletingId === ann.id ? <CircularProgress size={16} color="inherit" /> : <Delete fontSize="small" />}
									</IconButton>
								)}
							</Stack>
						</CardContent>
					</Card>
				))}
			</Stack>
		</Box>
	);
}

export default function SettingsPage() {
	const [tab, setTab] = useState(0);

	return (
		<AppLayout>
			<Box sx={{ p: { xs: 2, md: 3 } }}>
				<Typography variant="h4" sx={{ fontWeight: 700, mb: 2 }}>
					Settings
				</Typography>

				<Tabs
					value={tab}
					onChange={(_, v) => setTab(v)}
					sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}
				>
					<Tab icon={<Settings sx={{ fontSize: 18 }} />} iconPosition="start" label="General" />
					<Tab icon={<Campaign sx={{ fontSize: 18 }} />} iconPosition="start" label="Announcements" />
					<Tab icon={<FolderZip sx={{ fontSize: 18 }} />} iconPosition="start" label="Data Management" />
				</Tabs>

				{tab === 0 && (
					<Typography variant="body1" color="text.secondary">
						General settings coming soon.
					</Typography>
				)}

				{tab === 1 && <AnnouncementsTab />}

				{tab === 2 && <DataManagementPage />}
			</Box>
		</AppLayout>
	);
}
