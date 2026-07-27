import { useState, useRef } from 'react';
import {
  Box, Typography, Card, CardContent, CardHeader, Button, Checkbox,
  FormControlLabel, FormGroup, Divider, Stack, Chip, LinearProgress,
  Alert, AlertTitle, Dialog, DialogTitle, DialogContent, DialogActions,
  Tab, Tabs, Paper, List, ListItem, ListItemText, ListItemIcon,
  CircularProgress, TextField,
} from '@mui/material';
import {
  FileDownload, FileUpload, CheckBox, CheckBoxOutlineBlank,
  FolderZip, CloudUpload, WarningAmber, CheckCircle, Storage,
  Inventory2, ReceiptLong, AccountBalanceWallet, Badge,
  DeleteForever, Lock,
} from '@mui/icons-material';
import {
  EXPORT_SECTIONS,
  allExportSectionItems,
  clearSelectedData,
} from '@/services/datamanagement.service';
import { exportToExcel, parseExcelFile, importFromExcel } from '@/services/excel.service';
import useAuth from '@/hooks/useAuth';
import toast from 'react-hot-toast';

const GROUP_ICONS = {
  'Products & Catalog':      <Inventory2 fontSize="small" color="primary" />,
  'Inventory':               <Storage fontSize="small" color="warning" />,
  'Sales & Deliveries':      <ReceiptLong fontSize="small" color="success" />,
  'Finance':                 <AccountBalanceWallet fontSize="small" color="error" />,
  'Medical Representatives': <Badge fontSize="small" color="info" />,
};

const TabPanel = ({ value, index, children }) =>
  value === index ? <Box sx={{ pt: 3 }}>{children}</Box> : null;

export default function DataManagementPage() {
  const { isAdmin, isSuperAdmin } = useAuth();
  const canClearData = isAdmin?.() || isSuperAdmin?.();

  const [tab, setTab] = useState(0);

  // ── Export state ────────────────────────────────────────────────────────────────────────
  const [exportSelected, setExportSelected] = useState([]);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(null);

  // ── Import state ────────────────────────────────────────────────────────────────────────
  const [importFile, setImportFile] = useState(null);
  const [importFileName, setImportFileName] = useState('');
  const [importSelected, setImportSelected] = useState([]);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(null);
  const [importResults, setImportResults] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const fileInputRef = useRef(null);

  // ── Clear data state ─────────────────────────────────────────────────────────────────────
  const [clearSelected, setClearSelected] = useState([]);
  const [clearing, setClearing] = useState(false);
  const [clearProgress, setClearProgress] = useState(null);
  const [clearResults, setClearResults] = useState(null);
  const [archivePromptOpen, setArchivePromptOpen] = useState(false);
  const [finalConfirmOpen, setFinalConfirmOpen] = useState(false);
  const [clearWithArchive, setClearWithArchive] = useState(false);
  const [confirmDeleteText, setConfirmDeleteText] = useState('');

  const labelFor = (key) => allExportSectionItems().find((s) => s.key === key)?.label || key;

  // ── Export helpers ────────────────────────────────────────────────────────────────────────
  const allExportKeys = allExportSectionItems().map((s) => s.key);
  const allExportSelected = exportSelected.length === allExportKeys.length;

  const toggleExportAll = () =>
    setExportSelected(allExportSelected ? [] : [...allExportKeys]);

  const toggleExportKey = (key) =>
    setExportSelected((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );

  const handleExport = async () => {
    if (!exportSelected.length) {
      toast.error('Select at least one data section to export.');
      return;
    }
    setExporting(true);
    setExportProgress(null);
    try {
      const blob = await exportToExcel(exportSelected, (p) => setExportProgress(p));
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const date = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `therapevo-backup-${date}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Excel backup downloaded successfully.');
    } catch (err) {
      toast.error(err.message || 'Export failed.');
    } finally {
      setExporting(false);
      setExportProgress(null);
    }
  };

  // ── Import helpers ────────────────────────────────────────────────────────────────────────
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = await parseExcelFile(file);
      setImportFile(parsed);
      setImportFileName(file.name);
      setImportSelected(Object.keys(parsed.data));
      setImportResults(null);
    } catch (err) {
      toast.error(err.message || 'Failed to read Excel file.');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const allImportKeys = importFile ? Object.keys(importFile.data) : [];
  const allImportSelected = importSelected.length === allImportKeys.length && allImportKeys.length > 0;

  const toggleImportAll = () =>
    setImportSelected(allImportSelected ? [] : [...allImportKeys]);

  const toggleImportKey = (key) =>
    setImportSelected((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );

  const handleImport = async () => {
    if (!importFile || !importSelected.length) return;
    setConfirmOpen(false);
    setImporting(true);
    setImportProgress(null);
    setImportResults(null);
    try {
      const results = await importFromExcel(importFile, importSelected, (p) =>
        setImportProgress(p)
      );
      setImportResults(results);
      const total = Object.values(results).reduce((s, n) => s + n, 0);
      toast.success(`Imported ${total.toLocaleString()} records successfully.`);
    } catch (err) {
      toast.error(err.message || 'Import failed.');
    } finally {
      setImporting(false);
      setImportProgress(null);
    }
  };

  const resetImport = () => {
    setImportFile(null);
    setImportFileName('');
    setImportSelected([]);
    setImportResults(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ── Clear data helpers ───────────────────────────────────────────────────────────────────────
  const allClearKeys = allExportSectionItems().map((s) => s.key);
  const allClearSelected = clearSelected.length === allClearKeys.length;

  const toggleClearAll = () =>
    setClearSelected(allClearSelected ? [] : [...allClearKeys]);

  const toggleClearKey = (key) =>
    setClearSelected((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );

  const handleClearClick = () => {
    if (!clearSelected.length) {
      toast.error('Select at least one data section to clear.');
      return;
    }
    setClearResults(null);
    setArchivePromptOpen(true);
  };

  const handleArchiveChoice = (withArchive) => {
    setClearWithArchive(withArchive);
    setArchivePromptOpen(false);
    setConfirmDeleteText('');
    setFinalConfirmOpen(true);
  };

  const handleFinalConfirm = async () => {
    setFinalConfirmOpen(false);
    setClearing(true);
    setClearProgress(null);
    setClearResults(null);
    try {
      if (clearWithArchive) {
        toast.loading('Archiving data…', { id: 'arch' });
        const blob = await exportToExcel(clearSelected, () => {});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const date = new Date().toISOString().slice(0, 10);
        a.href = url;
        a.download = `therapevo-archive-before-clear-${date}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success('Archive downloaded.', { id: 'arch' });
      }
      const results = await clearSelectedData(clearSelected, (p) => setClearProgress(p));
      setClearResults(results);
      const total = Object.values(results).reduce((s, n) => s + n, 0);
      toast.success(`Cleared ${total.toLocaleString()} records successfully.`);
      setClearSelected([]);
    } catch (err) {
      toast.error(err.message || 'Clear operation failed.');
    } finally {
      setClearing(false);
      setClearProgress(null);
    }
  };

  return (
    <>
      <Box sx={{ maxWidth: 920, mx: 'auto' }}>
        <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 3 }}>
          <FolderZip sx={{ fontSize: 38, color: 'primary.main' }} />
          <Box>
            <Typography variant="h5" fontWeight={700}>Data Management</Typography>
            <Typography variant="body2" color="text.secondary">
              Export data as an Excel file to archive on Google Drive, or restore from a previous backup.
            </Typography>
          </Box>
        </Stack>

        <Paper variant="outlined" sx={{ borderRadius: 2 }}>
          <Tabs
            value={tab}
            onChange={(_, v) => setTab(v)}
            sx={{ px: 2, borderBottom: 1, borderColor: 'divider' }}
          >
            <Tab icon={<FileDownload />} iconPosition="start" label="Export to Excel" />
            <Tab icon={<FileUpload />} iconPosition="start" label="Import from Excel" />
            <Tab
              icon={<DeleteForever />}
              iconPosition="start"
              label="Clear Data"
              sx={{ color: tab === 2 ? 'error.main' : undefined }}
            />
          </Tabs>

          {/* ── EXPORT TAB ──────────────────────────────────────────────────────────────────── */}
          <TabPanel value={tab} index={0}>
            <Box sx={{ p: 3, pt: 1 }}>
              <Alert severity="info" sx={{ mb: 3 }}>
                <AlertTitle>How to archive to Google Drive</AlertTitle>
                Select the data to export, click <strong>Export to Excel</strong>, then upload the
                downloaded <code>.xlsx</code> file to your Google Drive folder.
                Each collection becomes its own sheet in the workbook.
              </Alert>

              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
                <Typography variant="subtitle1" fontWeight={600}>Select Data to Export</Typography>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={allExportSelected ? <CheckBoxOutlineBlank /> : <CheckBox />}
                  onClick={toggleExportAll}
                >
                  {allExportSelected ? 'Deselect All' : 'Select All'}
                </Button>
              </Stack>

              <Stack spacing={2} sx={{ mb: 3 }}>
                {EXPORT_SECTIONS.map((group) => (
                  <Card key={group.group} variant="outlined" sx={{ borderRadius: 2 }}>
                    <CardHeader
                      avatar={GROUP_ICONS[group.group]}
                      title={<Typography variant="subtitle2" fontWeight={600}>{group.group}</Typography>}
                      sx={{ pb: 0 }}
                    />
                    <CardContent sx={{ pt: 1 }}>
                      <FormGroup row>
                        {group.items.map((item) => (
                          <FormControlLabel
                            key={item.key}
                            sx={{ width: { xs: '100%', sm: '50%' } }}
                            control={
                              <Checkbox
                                size="small"
                                checked={exportSelected.includes(item.key)}
                                onChange={() => toggleExportKey(item.key)}
                              />
                            }
                            label={<Typography variant="body2">{item.label}</Typography>}
                          />
                        ))}
                      </FormGroup>
                    </CardContent>
                  </Card>
                ))}
              </Stack>

              {exporting && exportProgress && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Fetching: <strong>{exportProgress.label}</strong> ({exportProgress.current}/{exportProgress.total})
                  </Typography>
                  <LinearProgress
                    variant="determinate"
                    value={(exportProgress.current / exportProgress.total) * 100}
                  />
                </Box>
              )}

              <Stack direction="row" spacing={2} alignItems="center">
                <Button
                  variant="contained"
                  size="large"
                  startIcon={exporting ? <CircularProgress size={18} color="inherit" /> : <FileDownload />}
                  onClick={handleExport}
                  disabled={exporting || !exportSelected.length}
                >
                  {exporting ? 'Exporting…' : 'Export to Excel'}
                </Button>
                {!exporting && exportSelected.length > 0 && (
                  <Typography variant="body2" color="text.secondary">
                    {exportSelected.length} section{exportSelected.length !== 1 ? 's' : ''} selected
                  </Typography>
                )}
              </Stack>
            </Box>
          </TabPanel>

          {/* ── IMPORT TAB ──────────────────────────────────────────────────────────────────── */}
          <TabPanel value={tab} index={1}>
            <Box sx={{ p: 3, pt: 1 }}>
              <Alert severity="warning" sx={{ mb: 3 }}>
                <AlertTitle>Important — Read before importing</AlertTitle>
                Importing will <strong>overwrite</strong> existing records that share the same document
                ID. This cannot be undone. Always export a fresh backup before importing.
              </Alert>

              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />

              {!importFile ? (
                <Paper
                  variant="outlined"
                  onClick={() => fileInputRef.current?.click()}
                  sx={{
                    border: '2px dashed',
                    borderColor: 'primary.main',
                    borderRadius: 3,
                    p: 6,
                    textAlign: 'center',
                    cursor: 'pointer',
                    '&:hover': { bgcolor: 'action.hover' },
                  }}
                >
                  <CloudUpload sx={{ fontSize: 52, color: 'primary.main', mb: 1 }} />
                  <Typography variant="subtitle1" fontWeight={600}>
                    Click to select a backup file
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Accepts <code>therapevo-backup-*.xlsx</code> files
                  </Typography>
                </Paper>
              ) : (
                <Stack spacing={3}>
                  <Card variant="outlined" sx={{ borderRadius: 2 }}>
                    <CardContent>
                      <Stack direction="row" alignItems="flex-start" spacing={2}>
                        <CheckCircle color="success" sx={{ mt: 0.3 }} />
                        <Box flex={1}>
                          <Typography variant="subtitle2" fontWeight={600}>{importFileName}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {importFile.exportedAt
                              ? `Exported: ${new Date(importFile.exportedAt).toLocaleString()}`
                              : 'Export date unknown'}
                            &nbsp;&middot;&nbsp;System: {importFile.system}
                          </Typography>
                          <Divider sx={{ my: 1 }} />
                          <Typography variant="body2" color="text.secondary" gutterBottom>
                            Collections in this backup:
                          </Typography>
                          <Stack direction="row" flexWrap="wrap" gap={1}>
                            {Object.entries(importFile.meta).map(([k, m]) => (
                              <Chip
                                key={k}
                                size="small"
                                label={`${labelFor(k)}: ${m.count.toLocaleString()}`}
                                variant="outlined"
                              />
                            ))}
                          </Stack>
                        </Box>
                        <Button size="small" variant="outlined" onClick={resetImport}>
                          Change File
                        </Button>
                      </Stack>
                    </CardContent>
                  </Card>

                  <Box>
                    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                      <Typography variant="subtitle2" fontWeight={600}>Select sections to restore</Typography>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={allImportSelected ? <CheckBoxOutlineBlank /> : <CheckBox />}
                        onClick={toggleImportAll}
                      >
                        {allImportSelected ? 'Deselect All' : 'Select All'}
                      </Button>
                    </Stack>
                    <FormGroup row>
                      {allImportKeys.map((key) => (
                        <FormControlLabel
                          key={key}
                          sx={{ width: { xs: '100%', sm: '50%' } }}
                          control={
                            <Checkbox
                              size="small"
                              checked={importSelected.includes(key)}
                              onChange={() => toggleImportKey(key)}
                            />
                          }
                          label={
                            <Typography variant="body2">
                              {labelFor(key)}&nbsp;
                              <Typography component="span" variant="caption" color="text.secondary">
                                ({(importFile.meta?.[key]?.count ?? 0).toLocaleString()} rows)
                              </Typography>
                            </Typography>
                          }
                        />
                      ))}
                    </FormGroup>
                  </Box>

                  {importing && importProgress && (
                    <Box>
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        Writing: <strong>{importProgress.label}</strong> ({importProgress.current}/{importProgress.total})
                      </Typography>
                      <LinearProgress
                        variant="determinate"
                        value={(importProgress.current / importProgress.total) * 100}
                      />
                    </Box>
                  )}

                  {importResults && (
                    <Alert severity="success">
                      <AlertTitle>Import Complete</AlertTitle>
                      <List dense disablePadding>
                        {Object.entries(importResults).map(([key, count]) => (
                          <ListItem key={key} disablePadding>
                            <ListItemIcon sx={{ minWidth: 28 }}>
                              <CheckCircle fontSize="small" color="success" />
                            </ListItemIcon>
                            <ListItemText
                              primary={`${labelFor(key)}: ${count.toLocaleString()} records written`}
                              primaryTypographyProps={{ variant: 'body2' }}
                            />
                          </ListItem>
                        ))}
                      </List>
                    </Alert>
                  )}

                  <Box>
                    <Button
                      variant="contained"
                      color="warning"
                      size="large"
                      startIcon={importing ? <CircularProgress size={18} color="inherit" /> : <FileUpload />}
                      onClick={() => setConfirmOpen(true)}
                      disabled={importing || !importSelected.length}
                    >
                      {importing ? 'Importing…' : 'Import Selected Data'}
                    </Button>
                  </Box>
                </Stack>
              )}
            </Box>
          </TabPanel>

          {/* ── CLEAR DATA TAB ─────────────────────────────────────────────────────────────────── */}
          <TabPanel value={tab} index={2}>
            <Box sx={{ p: 3, pt: 1 }}>
              {!canClearData ? (
                <Alert severity="error" icon={<Lock />}>
                  <AlertTitle>Admin Access Required</AlertTitle>
                  Only administrators (Admin or Super Admin) can permanently clear data.
                </Alert>
              ) : (
                <>
                  <Alert severity="error" sx={{ mb: 3 }}>
                    <AlertTitle>Danger Zone — Admin Only</AlertTitle>
                    Clearing data permanently deletes all records in the selected collections from
                    Firestore. <strong>This cannot be undone.</strong> You will be given the option
                    to download an Excel archive before the deletion proceeds.
                  </Alert>

                  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
                    <Typography variant="subtitle1" fontWeight={600}>Select Data to Clear</Typography>
                    <Button
                      size="small"
                      variant="outlined"
                      color="error"
                      startIcon={allClearSelected ? <CheckBoxOutlineBlank /> : <CheckBox />}
                      onClick={toggleClearAll}
                    >
                      {allClearSelected ? 'Deselect All' : 'Select All'}
                    </Button>
                  </Stack>

                  <Stack spacing={2} sx={{ mb: 3 }}>
                    {EXPORT_SECTIONS.map((group) => (
                      <Card key={group.group} variant="outlined" sx={{ borderRadius: 2 }}>
                        <CardHeader
                          avatar={GROUP_ICONS[group.group]}
                          title={<Typography variant="subtitle2" fontWeight={600}>{group.group}</Typography>}
                          sx={{ pb: 0 }}
                        />
                        <CardContent sx={{ pt: 1 }}>
                          <FormGroup row>
                            {group.items.map((item) => (
                              <FormControlLabel
                                key={item.key}
                                sx={{ width: { xs: '100%', sm: '50%' } }}
                                control={
                                  <Checkbox
                                    size="small"
                                    color="error"
                                    checked={clearSelected.includes(item.key)}
                                    onChange={() => toggleClearKey(item.key)}
                                  />
                                }
                                label={<Typography variant="body2">{item.label}</Typography>}
                              />
                            ))}
                          </FormGroup>
                        </CardContent>
                      </Card>
                    ))}
                  </Stack>

                  {clearing && clearProgress && (
                    <Box sx={{ mb: 2 }}>
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        Deleting: <strong>{clearProgress.label}</strong> ({clearProgress.current}/{clearProgress.total})
                      </Typography>
                      <LinearProgress
                        color="error"
                        variant="determinate"
                        value={(clearProgress.current / clearProgress.total) * 100}
                      />
                    </Box>
                  )}

                  {clearResults && (
                    <Alert severity="success" sx={{ mb: 2 }}>
                      <AlertTitle>Clear Complete</AlertTitle>
                      <List dense disablePadding>
                        {Object.entries(clearResults).map(([key, count]) => (
                          <ListItem key={key} disablePadding>
                            <ListItemIcon sx={{ minWidth: 28 }}>
                              <CheckCircle fontSize="small" color="success" />
                            </ListItemIcon>
                            <ListItemText
                              primary={`${labelFor(key)}: ${count.toLocaleString()} records deleted`}
                              primaryTypographyProps={{ variant: 'body2' }}
                            />
                          </ListItem>
                        ))}
                      </List>
                    </Alert>
                  )}

                  <Stack direction="row" spacing={2} alignItems="center">
                    <Button
                      variant="contained"
                      color="error"
                      size="large"
                      startIcon={clearing ? <CircularProgress size={18} color="inherit" /> : <DeleteForever />}
                      onClick={handleClearClick}
                      disabled={clearing || !clearSelected.length}
                    >
                      {clearing ? 'Clearing…' : 'Clear Selected Data'}
                    </Button>
                    {!clearing && clearSelected.length > 0 && (
                      <Typography variant="body2" color="text.secondary">
                        {clearSelected.length} section{clearSelected.length !== 1 ? 's' : ''} selected
                      </Typography>
                    )}
                  </Stack>
                </>
              )}
            </Box>
          </TabPanel>
        </Paper>
      </Box>

      {/* ── Import confirm dialog ─────────────────────────────────────────────────────────────────── */}
      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <WarningAmber color="warning" /> Confirm Import
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            You are about to restore{' '}
            <strong>{importSelected.length} collection{importSelected.length !== 1 ? 's' : ''}</strong>{' '}
            from <strong>{importFileName}</strong>.
          </Typography>
          <Typography variant="body2" color="error.main" sx={{ mt: 1 }}>
            Existing documents with matching IDs will be <strong>overwritten</strong>.
            This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
          <Button variant="contained" color="warning" onClick={handleImport}>
            Yes, Import
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Step 1: Archive-first prompt ────────────────────────────────────────────────────────────────── */}
      <Dialog
        open={archivePromptOpen}
        onClose={() => setArchivePromptOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <WarningAmber color="error" /> Archive Data Before Clearing?
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1.5 }}>
            You are about to permanently delete{' '}
            <strong>{clearSelected.length} collection{clearSelected.length !== 1 ? 's' : ''}</strong>.
            It is strongly recommended to download an Excel backup first so you can restore
            the data if needed.
          </Typography>
          <Stack direction="row" flexWrap="wrap" gap={1}>
            {clearSelected.map((key) => (
              <Chip key={key} size="small" label={labelFor(key)} variant="outlined" color="error" />
            ))}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1, flexWrap: 'wrap' }}>
          <Button onClick={() => setArchivePromptOpen(false)}>Cancel</Button>
          <Button
            variant="outlined"
            color="error"
            onClick={() => handleArchiveChoice(false)}
          >
            Clear Without Archiving
          </Button>
          <Button
            variant="contained"
            color="primary"
            startIcon={<FileDownload />}
            onClick={() => handleArchiveChoice(true)}
          >
            Archive &amp; Clear
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Step 2: Final confirmation (type DELETE) ─────────────────────────────────────────────────────────────── */}
      <Dialog
        open={finalConfirmOpen}
        onClose={() => setFinalConfirmOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'error.main' }}>
          <DeleteForever color="error" /> Confirm Permanent Deletion
        </DialogTitle>
        <DialogContent>
          <Alert severity="error" sx={{ mb: 2 }}>
            This will <strong>permanently delete all records</strong> in the selected collections.
            {' '}
            {clearWithArchive
              ? 'An Excel archive will be downloaded first.'
              : 'No backup will be made.'}
            {' '}This cannot be undone.
          </Alert>
          <List dense disablePadding sx={{ mb: 2 }}>
            {clearSelected.map((key) => (
              <ListItem key={key} disablePadding sx={{ py: 0.25 }}>
                <ListItemIcon sx={{ minWidth: 28 }}>
                  <DeleteForever fontSize="small" color="error" />
                </ListItemIcon>
                <ListItemText
                  primary={labelFor(key)}
                  primaryTypographyProps={{ variant: 'body2' }}
                />
              </ListItem>
            ))}
          </List>
          <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>
            Type <strong>DELETE</strong> to confirm:
          </Typography>
          <TextField
            fullWidth
            size="small"
            placeholder="DELETE"
            value={confirmDeleteText}
            onChange={(e) => setConfirmDeleteText(e.target.value)}
            autoComplete="off"
            inputProps={{ spellCheck: false }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFinalConfirmOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            startIcon={<DeleteForever />}
            disabled={confirmDeleteText !== 'DELETE'}
            onClick={handleFinalConfirm}
          >
            {clearWithArchive ? 'Archive & Delete' : 'Delete Permanently'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
