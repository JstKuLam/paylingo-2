package com.paylingo.androidApp

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.core.content.ContextCompat
import com.paylingo.audio.AndroidAudioRecorder
import com.paylingo.db.DatabaseDriverFactory
import com.paylingo.db.Session
import com.paylingo.db.SessionRepository
import com.paylingo.db.TranscriptMessage
import com.paylingo.viewmodel.SessionState
import com.paylingo.viewmodel.SessionViewModel
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class MainActivity : ComponentActivity() {
    companion object {
        @Volatile
        private var sharedViewModel: SessionViewModel? = null

        fun getOrCreateViewModel(appContext: android.content.Context): SessionViewModel {
            return sharedViewModel ?: synchronized(this) {
                sharedViewModel ?: run {
                    val driverFactory = DatabaseDriverFactory(appContext)
                    val repository = SessionRepository(driverFactory)
                    val audioRecorder = AndroidAudioRecorder()
                    SessionViewModel(audioRecorder, repository).also { sharedViewModel = it }
                }
            }
        }
    }

    private val requestPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { _ -> }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
        }

        com.paylingo.utils.AndroidAppContext.context = applicationContext
        val viewModel = getOrCreateViewModel(applicationContext)

        setContent {
            val state by viewModel.state.collectAsState()
            val isDark = state.themeMode == "dark"
            val currentView = LocalView.current
            val keepAwake = state.isRecording || state.isConnecting

            DisposableEffect(keepAwake) {
                currentView.keepScreenOn = keepAwake
                if (keepAwake) {
                    window.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                } else {
                    window.clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                }
                onDispose {
                    currentView.keepScreenOn = false
                    window.clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                }
            }

            val colorScheme = if (isDark) {
                darkColorScheme(
                    background = Color(0xFF0B0E14),
                    surface = Color(0xFF131822),
                    primary = Color(0xFF0A84FF),
                    secondary = Color(0xFF10B981),
                    error = Color(0xFFEF4444)
                )
            } else {
                lightColorScheme(
                    background = Color(0xFFF4F6FA),
                    surface = Color(0xFFFFFFFF),
                    primary = Color(0xFF0066CC),
                    secondary = Color(0xFF059669),
                    error = Color(0xFFDC2626)
                )
            }

            MaterialTheme(colorScheme = colorScheme) {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    PayLingoMobileApp(viewModel, state)
                }
            }
        }
    }

    override fun onStop() {
        super.onStop()
        if (!isChangingConfigurations) {
            sharedViewModel?.stopSession()
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        if (isFinishing) {
            sharedViewModel?.stopSession()
        }
    }
}

data class PartnerLanguage(val code: String, val shortCode: String, val name: String)

val PARTNER_LANGUAGES = listOf(
    PartnerLanguage("any", "AUTO", "Tự nhận diện (Auto Detect)"),
    PartnerLanguage("en", "EN", "English"),
    PartnerLanguage("zh", "ZH", "中文 (Chinese)"),
    PartnerLanguage("ja", "JA", "日本語 (Japanese)"),
    PartnerLanguage("ko", "KO", "한국어 (Korean)"),
    PartnerLanguage("es", "ES", "Español"),
    PartnerLanguage("ru", "RU", "Русский"),
    PartnerLanguage("de", "DE", "Deutsch"),
    PartnerLanguage("th", "TH", "ภาษาไทย")
)

fun formatDurationSeconds(seconds: Int): String {
    val mins = seconds / 60
    val secs = seconds % 60
    return String.format(Locale.US, "%02d:%02d", mins, secs)
}

fun formatTimestamp(ms: Long): String {
    return try {
        SimpleDateFormat("dd/MM HH:mm", Locale.getDefault()).format(Date(ms))
    } catch (_: Exception) {
        ""
    }
}

@Composable
fun PayLingoMobileApp(viewModel: SessionViewModel, state: SessionState) {
    if (state.needsUpdate) {
        UpdateOverlay(state.updateUrl)
        return
    }

    if (!state.isOnboarded) {
        OnboardingScreen(
            initialName = state.userName,
            initialKey = state.sonioxApiKey,
            isDark = state.themeMode == "dark",
            onToggleTheme = { viewModel.toggleTheme() },
            onContinue = { name, key -> viewModel.saveProfile(name, key) }
        )
        return
    }

    if (state.activeScreen == "history") {
        HistoryScreen(viewModel = viewModel, state = state)
    } else {
        InterpreterScreen(viewModel = viewModel, state = state)
    }
}

@Composable
fun OnboardingScreen(
    initialName: String,
    initialKey: String,
    isDark: Boolean,
    onToggleTheme: () -> Unit,
    onContinue: (String, String) -> Unit
) {
    val context = LocalContext.current
    var name by remember { mutableStateOf(initialName) }
    var apiKey by remember { mutableStateOf(initialKey) }
    var showKey by remember { mutableStateOf(false) }
    var localError by remember { mutableStateOf<String?>(null) }

    val bg = if (isDark) Color(0xFF0B0E14) else Color(0xFFF4F6FA)
    val cardBg = if (isDark) Color(0xFF131822) else Color(0xFFFFFFFF)
    val textMain = if (isDark) Color(0xFFF1F5F9) else Color(0xFF0F172A)
    val textSub = if (isDark) Color(0xFF94A3B8) else Color(0xFF64748B)
    val borderCol = if (isDark) Color.White.copy(alpha = 0.08f) else Color.Black.copy(alpha = 0.08f)

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(bg)
            .padding(20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.SpaceBetween
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Box(
                    modifier = Modifier
                        .size(32.dp)
                        .clip(RoundedCornerShape(9.dp))
                        .background(Color(0xFF0A84FF)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Filled.ChatBubbleOutline,
                        contentDescription = null,
                        tint = Color.White,
                        modifier = Modifier.size(18.dp)
                    )
                }
                Text(
                    text = "PayLingo",
                    fontSize = 17.sp,
                    fontWeight = FontWeight.Bold,
                    color = textMain
                )
            }

            IconButton(onClick = onToggleTheme) {
                Icon(
                    imageVector = if (isDark) Icons.Filled.LightMode else Icons.Filled.DarkMode,
                    contentDescription = "Đổi giao diện",
                    tint = textSub
                )
            }
        }

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(24.dp))
                .background(cardBg)
                .border(1.dp, borderCol, RoundedCornerShape(24.dp))
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .clip(RoundedCornerShape(14.dp))
                    .background(Color(0xFF0A84FF).copy(alpha = 0.14f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Filled.ChatBubbleOutline,
                    contentDescription = null,
                    tint = Color(0xFF0A84FF),
                    modifier = Modifier.size(24.dp)
                )
            }

            Spacer(modifier = Modifier.height(14.dp))
            Text(
                text = "Bắt đầu phiên dịch",
                fontSize = 20.sp,
                fontWeight = FontWeight.Bold,
                color = textMain
            )
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                text = "Nhập tên của bạn và Soniox API Key cá nhân để sử dụng trực tiếp.",
                fontSize = 13.sp,
                color = textSub,
                textAlign = TextAlign.Center
            )

            Spacer(modifier = Modifier.height(20.dp))

            Column(modifier = Modifier.fillMaxWidth()) {
                Text(
                    text = "Tên của bạn",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = textSub
                )
                Spacer(modifier = Modifier.height(6.dp))
                OutlinedTextField(
                    value = name,
                    onValueChange = {
                        name = it
                        localError = null
                    },
                    placeholder = { Text("VD: Minh Anh") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp)
                )
            }

            Spacer(modifier = Modifier.height(14.dp))

            Column(modifier = Modifier.fillMaxWidth()) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Soniox API Key",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = textSub
                    )
                    Text(
                        text = "Lấy API Key ↗",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = Color(0xFF0A84FF),
                        modifier = Modifier.clickable {
                            try {
                                context.startActivity(
                                    Intent(Intent.ACTION_VIEW, Uri.parse("https://console.soniox.com"))
                                )
                            } catch (_: Exception) {}
                        }
                    )
                }
                Spacer(modifier = Modifier.height(6.dp))
                OutlinedTextField(
                    value = apiKey,
                    onValueChange = { apiKey = it },
                    placeholder = { Text("Dán Soniox API Key của bạn...") },
                    singleLine = true,
                    visualTransformation = if (showKey) VisualTransformation.None else PasswordVisualTransformation(),
                    trailingIcon = {
                        IconButton(onClick = { showKey = !showKey }) {
                            Icon(
                                imageVector = if (showKey) Icons.Filled.VisibilityOff else Icons.Filled.Visibility,
                                contentDescription = "Ẩn/Hiện Key"
                            )
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp)
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "Key chỉ lưu trên thiết bị của bạn và kết nối thẳng tới Soniox.",
                    fontSize = 11.sp,
                    color = textSub
                )
            }

            if (localError != null) {
                Spacer(modifier = Modifier.height(10.dp))
                Text(
                    text = localError ?: "",
                    fontSize = 12.sp,
                    color = Color(0xFFEF4444),
                    fontWeight = FontWeight.SemiBold
                )
            }

            Spacer(modifier = Modifier.height(20.dp))

            Button(
                onClick = {
                    if (name.trim().isEmpty()) {
                        localError = "Vui lòng nhập tên của bạn."
                    } else {
                        onContinue(name.trim(), apiKey.trim())
                    }
                },
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0A84FF)),
                shape = RoundedCornerShape(24.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp)
            ) {
                Text(
                    text = "Bắt đầu phiên dịch",
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White
                )
            }
        }

        Spacer(modifier = Modifier.height(12.dp))
    }
}

@Composable
fun InterpreterScreen(viewModel: SessionViewModel, state: SessionState) {
    val isDark = state.themeMode == "dark"
    val bg = if (isDark) Color(0xFF0B0E14) else Color(0xFFF4F6FA)
    val surface = if (isDark) Color(0xFF131822) else Color(0xFFFFFFFF)
    val surface2 = if (isDark) Color(0xFF1C2331) else Color(0xFFE9EEF5)
    val textMain = if (isDark) Color(0xFFF1F5F9) else Color(0xFF0F172A)
    val textSub = if (isDark) Color(0xFF94A3B8) else Color(0xFF64748B)
    val borderCol = if (isDark) Color.White.copy(alpha = 0.08f) else Color.Black.copy(alpha = 0.08f)

    var showLanguageDialog by remember { mutableStateOf(false) }
    var showProfileDialog by remember { mutableStateOf(false) }
    var showApiKeyDialog by remember { mutableStateOf(false) }

    val availableLanguages = remember(state.recordingMode) {
        if (state.recordingMode == "two_way") {
            PARTNER_LANGUAGES.filter { it.code != "any" }
        } else {
            PARTNER_LANGUAGES
        }
    }
    val selectedPartner = PARTNER_LANGUAGES.find { it.code == state.partnerLang } ?: PARTNER_LANGUAGES[1]
    val textScale = state.fontSize / 100f

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(bg)
    ) {
        // TOP BAR
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(surface)
                .border(1.dp, borderCol)
                .padding(horizontal = 12.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            // Row 1: Brand + Quick Actions
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(28.dp)
                            .clip(RoundedCornerShape(8.dp))
                            .background(Color(0xFF0A84FF)),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Filled.ChatBubbleOutline,
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.size(15.dp)
                        )
                    }
                    Text(
                        text = "PayLingo",
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold,
                        color = textMain
                    )
                }

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    // API Key Button
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                        modifier = Modifier
                            .clip(RoundedCornerShape(16.dp))
                            .background(surface2)
                            .clickable(enabled = !state.isRecording) { showApiKeyDialog = true }
                            .padding(horizontal = 10.dp, vertical = 6.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Filled.Key,
                            contentDescription = "API Key",
                            tint = if (state.sonioxApiKey.isNotBlank()) Color(0xFF10B981) else Color(0xFFF59E0B),
                            modifier = Modifier.size(14.dp)
                        )
                        Text(
                            text = "API Key",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = textMain
                        )
                    }

                    // History Button
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                        modifier = Modifier
                            .clip(RoundedCornerShape(16.dp))
                            .background(surface2)
                            .clickable(enabled = !state.isRecording) { viewModel.setScreen("history") }
                            .padding(horizontal = 10.dp, vertical = 6.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Filled.History,
                            contentDescription = "Lịch sử",
                            tint = textSub,
                            modifier = Modifier.size(14.dp)
                        )
                        Text(
                            text = "Lịch sử",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = textMain
                        )
                    }

                    // Theme Button
                    Box(
                        modifier = Modifier
                            .size(30.dp)
                            .clip(CircleShape)
                            .background(surface2)
                            .clickable { viewModel.toggleTheme() },
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = if (isDark) Icons.Filled.LightMode else Icons.Filled.DarkMode,
                            contentDescription = "Giao diện",
                            tint = textSub,
                            modifier = Modifier.size(15.dp)
                        )
                    }

                    // Profile Button
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(5.dp),
                        modifier = Modifier
                            .clip(RoundedCornerShape(16.dp))
                            .background(surface2)
                            .clickable(enabled = !state.isRecording) { showProfileDialog = true }
                            .padding(horizontal = 8.dp, vertical = 5.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(20.dp)
                                .clip(CircleShape)
                                .background(Color(0xFF0A84FF)),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = state.userName.take(1).uppercase().ifEmpty { "U" },
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold,
                                color = Color.White
                            )
                        }
                        Text(
                            text = state.userName.ifEmpty { "Khách" },
                            fontSize = 11.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = textMain,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.widthIn(max = 72.dp)
                        )
                    }
                }
            }

            // Row 2: Mode Selector + Display Tools
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Modes: 2 chiều | 1 chiều | Note
                Row(
                    modifier = Modifier
                        .clip(RoundedCornerShape(18.dp))
                        .background(surface2)
                        .padding(2.dp),
                    horizontalArrangement = Arrangement.spacedBy(2.dp)
                ) {
                    val modes = listOf(
                        "two_way" to "2 chiều",
                        "one_way" to "1 chiều",
                        "scribe" to "Note"
                    )
                    modes.forEach { (modeCode, label) ->
                        val active = state.recordingMode == modeCode
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(16.dp))
                                .background(if (active) surface else Color.Transparent)
                                .clickable(enabled = !state.isRecording) { viewModel.setMode(modeCode) }
                                .padding(horizontal = 10.dp, vertical = 6.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = label,
                                fontSize = 11.sp,
                                fontWeight = if (active) FontWeight.Bold else FontWeight.Medium,
                                color = if (active) textMain else textSub
                            )
                        }
                    }
                }

                // Layout & Font Controls
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    // Layout switcher: Stacked (Top/Bottom), Split (Left/Right), Flipped (180° Face-to-Face)
                    Row(
                        modifier = Modifier
                            .clip(RoundedCornerShape(16.dp))
                            .background(surface2)
                            .padding(2.dp)
                    ) {
                        val layouts = listOf(
                            Triple("stacked", Icons.Filled.ViewAgenda, "Trên / Dưới"),
                            Triple("split", Icons.Filled.VerticalSplit, "Chia đôi"),
                            Triple("flipped", Icons.Filled.ScreenRotation, "Ngược chiều 180°")
                        )
                        layouts.forEach { (code, icon, desc) ->
                            val active = state.layoutMode == code
                            Box(
                                modifier = Modifier
                                    .size(28.dp)
                                    .clip(RoundedCornerShape(14.dp))
                                    .background(if (active) surface else Color.Transparent)
                                    .clickable { viewModel.setLayoutMode(code) },
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(
                                    imageVector = icon,
                                    contentDescription = desc,
                                    tint = if (active) Color(0xFF0A84FF) else textSub,
                                    modifier = Modifier.size(15.dp)
                                )
                            }
                        }
                    }

                    // Font Stepper
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier
                            .clip(RoundedCornerShape(16.dp))
                            .background(surface2)
                            .padding(horizontal = 4.dp, vertical = 2.dp)
                    ) {
                        Text(
                            text = "A−",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = textMain,
                            modifier = Modifier
                                .clip(RoundedCornerShape(10.dp))
                                .clickable { viewModel.stepFontSize(-1) }
                                .padding(horizontal = 6.dp, vertical = 4.dp)
                        )
                        Text(
                            text = "${(18 * state.fontSize) / 100}",
                            fontSize = 11.sp,
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.Bold,
                            color = textSub
                        )
                        Text(
                            text = "A+",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = textMain,
                            modifier = Modifier
                                .clip(RoundedCornerShape(10.dp))
                                .clickable { viewModel.stepFontSize(1) }
                                .padding(horizontal = 6.dp, vertical = 4.dp)
                        )
                    }
                }
            }
        }

        // Error Banner
        AnimatedVisibility(visible = state.error != null) {
            state.error?.let { err ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color(0xFFEF4444).copy(alpha = 0.14f))
                        .padding(horizontal = 14.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = err,
                        fontSize = 12.sp,
                        color = Color(0xFFEF4444),
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.weight(1f)
                    )
                    if (state.sonioxApiKey.isBlank()) {
                        Text(
                            text = "Nhập Key",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFF0A84FF),
                            modifier = Modifier
                                .clickable { showApiKeyDialog = true }
                                .padding(start = 8.dp)
                        )
                    } else {
                        IconButton(
                            onClick = { viewModel.clearError() },
                            modifier = Modifier.size(22.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Filled.Close,
                                contentDescription = "Đóng",
                                tint = Color(0xFFEF4444),
                                modifier = Modifier.size(14.dp)
                            )
                        }
                    }
                }
            }
        }

        // DUAL TELEPROMPTER STAGE
        Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
            if (state.layoutMode == "split") {
                Row(modifier = Modifier.fillMaxSize()) {
                    Box(modifier = Modifier.weight(1f).fillMaxHeight()) {
                        TeleprompterPane(
                            isPartnerPane = true,
                            badge = selectedPartner.shortCode,
                            title = if (state.recordingMode == "scribe") "Bản ghi nguyên văn" else selectedPartner.name,
                            subtitle = if (state.partnerLang == "any") "Tự nhận diện" else "Màn hình đối tác",
                            messages = state.messages,
                            recordingMode = state.recordingMode,
                            partnerLang = state.partnerLang,
                            textScale = textScale,
                            isFlipped = false,
                            isDark = isDark,
                            canChangeLang = !state.isRecording,
                            onOpenLanguagePicker = { showLanguageDialog = true }
                        )
                    }
                    Box(
                        modifier = Modifier
                            .width(1.dp)
                            .fillMaxHeight()
                            .background(borderCol)
                    )
                    Box(modifier = Modifier.weight(1f).fillMaxHeight()) {
                        TeleprompterPane(
                            isPartnerPane = false,
                            badge = if (state.recordingMode == "scribe") "AI" else "VI",
                            title = if (state.recordingMode == "scribe") "Meeting Note" else "Tiếng Việt",
                            subtitle = if (state.recordingMode == "scribe") "Ý chính & việc cần làm" else "Màn hình của bạn",
                            messages = state.messages,
                            recordingMode = state.recordingMode,
                            partnerLang = state.partnerLang,
                            textScale = textScale,
                            isFlipped = false,
                            isDark = isDark,
                            canChangeLang = false,
                            onOpenLanguagePicker = {}
                        )
                    }
                }
            } else {
                Column(modifier = Modifier.fillMaxSize()) {
                    Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
                        TeleprompterPane(
                            isPartnerPane = true,
                            badge = selectedPartner.shortCode,
                            title = if (state.recordingMode == "scribe") "Bản ghi nguyên văn" else selectedPartner.name,
                            subtitle = if (state.partnerLang == "any") "Tự nhận diện" else "Màn hình đối tác",
                            messages = state.messages,
                            recordingMode = state.recordingMode,
                            partnerLang = state.partnerLang,
                            textScale = textScale,
                            isFlipped = state.layoutMode == "flipped",
                            isDark = isDark,
                            canChangeLang = !state.isRecording,
                            onOpenLanguagePicker = { showLanguageDialog = true }
                        )
                    }
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(1.dp)
                            .background(borderCol)
                    )
                    Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
                        TeleprompterPane(
                            isPartnerPane = false,
                            badge = if (state.recordingMode == "scribe") "AI" else "VI",
                            title = if (state.recordingMode == "scribe") "Meeting Note" else "Tiếng Việt",
                            subtitle = if (state.recordingMode == "scribe") "Ý chính & việc cần làm" else "Màn hình của bạn",
                            messages = state.messages,
                            recordingMode = state.recordingMode,
                            partnerLang = state.partnerLang,
                            textScale = textScale,
                            isFlipped = false,
                            isDark = isDark,
                            canChangeLang = false,
                            onOpenLanguagePicker = {}
                        )
                    }
                }
            }
        }

        // BOTTOM DOCK
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(surface)
                .border(1.dp, borderCol)
                .padding(horizontal = 14.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Left: VU status
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(
                        text = selectedPartner.shortCode,
                        fontSize = 9.sp,
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF0A84FF)
                    )
                    Text(
                        text = "VI",
                        fontSize = 9.sp,
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF10B981)
                    )
                }
                Text(
                    text = when {
                        state.isConnecting -> "Đang kết nối..."
                        state.isRecording -> formatDurationSeconds(state.elapsedSeconds)
                        else -> "Sẵn sàng"
                    },
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = if (state.isRecording) Color(0xFFEF4444) else textSub
                )
            }

            // Center: Start / Stop Recording Pill
            Button(
                onClick = {
                    if (state.isRecording) {
                        viewModel.stopSession()
                    } else if (state.sonioxApiKey.isBlank()) {
                        showApiKeyDialog = true
                    } else {
                        viewModel.startSession()
                    }
                },
                colors = ButtonDefaults.buttonColors(
                    containerColor = if (state.isRecording) Color(0xFFEF4444) else textMain
                ),
                shape = RoundedCornerShape(24.dp),
                contentPadding = PaddingValues(horizontal = 18.dp, vertical = 10.dp)
            ) {
                Icon(
                    imageVector = if (state.isRecording) Icons.Filled.Stop else Icons.Filled.Mic,
                    contentDescription = null,
                    tint = if (state.isRecording) Color.White else surface,
                    modifier = Modifier.size(16.dp)
                )
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    text = if (state.isRecording) "Kết thúc" else "Bắt đầu phiên dịch",
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold,
                    color = if (state.isRecording) Color.White else surface
                )
            }

            // Right: Sync Scroll Toggle
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp),
                modifier = Modifier
                    .clip(RoundedCornerShape(16.dp))
                    .background(if (state.syncScroll) Color(0xFF0A84FF).copy(alpha = 0.14f) else surface2)
                    .clickable { viewModel.toggleSyncScroll() }
                    .padding(horizontal = 10.dp, vertical = 7.dp)
            ) {
                Icon(
                    imageVector = Icons.Filled.Link,
                    contentDescription = "Cuộn đồng bộ",
                    tint = if (state.syncScroll) Color(0xFF0A84FF) else textSub,
                    modifier = Modifier.size(15.dp)
                )
            }
        }
    }

    // Partner Language Picker Modal
    if (showLanguageDialog) {
        Dialog(onDismissRequest = { showLanguageDialog = false }) {
            Card(
                shape = RoundedCornerShape(22.dp),
                colors = CardDefaults.cardColors(containerColor = surface),
                border = BorderStroke(1.dp, borderCol)
            ) {
                Column(modifier = Modifier.padding(18.dp)) {
                    Text(
                        text = "NGÔN NGỮ ĐỐI TÁC",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = textSub
                    )
                    Spacer(modifier = Modifier.height(10.dp))
                    LazyColumn(
                        modifier = Modifier.heightIn(max = 340.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        items(availableLanguages) { item ->
                            val selected = item.code == state.partnerLang
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(12.dp))
                                    .background(if (selected) Color(0xFF0A84FF).copy(alpha = 0.14f) else Color.Transparent)
                                    .clickable {
                                        viewModel.setPartnerLanguage(item.code)
                                        showLanguageDialog = false
                                    }
                                    .padding(horizontal = 12.dp, vertical = 10.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                                ) {
                                    Box(
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(6.dp))
                                            .background(surface2)
                                            .padding(horizontal = 6.dp, vertical = 2.dp)
                                    ) {
                                        Text(
                                            text = item.shortCode,
                                            fontSize = 11.sp,
                                            fontFamily = FontFamily.Monospace,
                                            fontWeight = FontWeight.Bold,
                                            color = Color(0xFF0A84FF)
                                        )
                                    }
                                    Text(
                                        text = item.name,
                                        fontSize = 13.sp,
                                        fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                                        color = textMain
                                    )
                                }
                                if (selected) {
                                    Icon(
                                        imageVector = Icons.Filled.Check,
                                        contentDescription = null,
                                        tint = Color(0xFF0A84FF),
                                        modifier = Modifier.size(16.dp)
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // Quick API Key Modal
    if (showApiKeyDialog) {
        var keyDraft by remember { mutableStateOf(state.sonioxApiKey) }
        val context = LocalContext.current
        Dialog(onDismissRequest = { showApiKeyDialog = false }) {
            Card(
                shape = RoundedCornerShape(22.dp),
                colors = CardDefaults.cardColors(containerColor = surface),
                border = BorderStroke(1.dp, borderCol)
            ) {
                Column(modifier = Modifier.padding(20.dp)) {
                    Text(
                        text = "Soniox API Key",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                        color = textMain
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "Lấy API Key tại console.soniox.com để dịch trực tiếp trên thiết bị.",
                        fontSize = 12.sp,
                        color = textSub,
                        modifier = Modifier.clickable {
                            try {
                                context.startActivity(
                                    Intent(Intent.ACTION_VIEW, Uri.parse("https://console.soniox.com"))
                                )
                            } catch (_: Exception) {}
                        }
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    OutlinedTextField(
                        value = keyDraft,
                        onValueChange = { keyDraft = it },
                        placeholder = { Text("Dán Soniox API Key vào đây...") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp)
                    )
                    Spacer(modifier = Modifier.height(14.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.End
                    ) {
                        TextButton(onClick = { showApiKeyDialog = false }) {
                            Text("Đóng", color = textSub)
                        }
                        Spacer(modifier = Modifier.width(8.dp))
                        Button(
                            onClick = {
                                viewModel.updateApiKey(keyDraft)
                                showApiKeyDialog = false
                            },
                            enabled = keyDraft.trim().isNotEmpty(),
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0A84FF)),
                            shape = RoundedCornerShape(16.dp)
                        ) {
                            Text("Lưu Key", color = Color.White)
                        }
                    }
                }
            }
        }
    }

    // Profile & Settings Modal
    if (showProfileDialog) {
        var nameDraft by remember { mutableStateOf(state.userName) }
        var keyDraft by remember { mutableStateOf(state.sonioxApiKey) }
        Dialog(onDismissRequest = { showProfileDialog = false }) {
            Card(
                shape = RoundedCornerShape(22.dp),
                colors = CardDefaults.cardColors(containerColor = surface),
                border = BorderStroke(1.dp, borderCol)
            ) {
                Column(modifier = Modifier.padding(20.dp)) {
                    Text(
                        text = "Cài đặt người dùng",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                        color = textMain
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    OutlinedTextField(
                        value = nameDraft,
                        onValueChange = { nameDraft = it },
                        label = { Text("Tên hiển thị") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp)
                    )
                    Spacer(modifier = Modifier.height(10.dp))
                    OutlinedTextField(
                        value = keyDraft,
                        onValueChange = { keyDraft = it },
                        label = { Text("Soniox API Key") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp)
                    )
                    Spacer(modifier = Modifier.height(14.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        TextButton(
                            onClick = {
                                showProfileDialog = false
                                viewModel.signOut()
                            }
                        ) {
                            Text("Đổi người dùng", color = Color(0xFFEF4444))
                        }

                        Button(
                            onClick = {
                                viewModel.saveProfile(nameDraft, keyDraft)
                                showProfileDialog = false
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0A84FF)),
                            shape = RoundedCornerShape(16.dp)
                        ) {
                            Text("Lưu cài đặt", color = Color.White)
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun TeleprompterPane(
    isPartnerPane: Boolean,
    badge: String,
    title: String,
    subtitle: String,
    messages: List<TranscriptMessage>,
    recordingMode: String,
    partnerLang: String,
    textScale: Float,
    isFlipped: Boolean,
    isDark: Boolean,
    canChangeLang: Boolean,
    onOpenLanguagePicker: () -> Unit
) {
    val textMain = if (isDark) Color(0xFFF1F5F9) else Color(0xFF0F172A)
    val textSub = if (isDark) Color(0xFF94A3B8) else Color(0xFF64748B)
    val borderCol = if (isDark) Color.White.copy(alpha = 0.07f) else Color.Black.copy(alpha = 0.07f)
    val roleColor = if (isPartnerPane) Color(0xFF0A84FF) else Color(0xFF10B981)
    val isScribeNotes = recordingMode == "scribe" && !isPartnerPane

    val listState = rememberLazyListState()
    val latestSignature = remember(messages) {
        val last = messages.lastOrNull()
        val totalLen = messages.sumOf { it.text.length + (it.translation?.length ?: 0) }
        "${messages.size}:${last?.id ?: ""}:${last?.text?.length ?: 0}:${last?.translation?.length ?: 0}:$totalLen"
    }
    LaunchedEffect(latestSignature) {
        if (messages.isNotEmpty() && !listState.isScrollInProgress) {
            val lastVisibleIndex = listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
            val isNearBottom = messages.size <= 2 || lastVisibleIndex >= messages.size - 3
            if (isNearBottom) {
                listState.animateScrollToItem(messages.size - 1, scrollOffset = 10_000)
            }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .then(if (isFlipped) Modifier.rotate(180f) else Modifier)
    ) {
        // Pane Header
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(44.dp)
                .border(1.dp, borderCol)
                .padding(horizontal = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = if (isPartnerPane && canChangeLang) {
                    Modifier
                        .clip(RoundedCornerShape(16.dp))
                        .border(1.dp, borderCol, RoundedCornerShape(16.dp))
                        .clickable { onOpenLanguagePicker() }
                        .padding(horizontal = 8.dp, vertical = 4.dp)
                } else {
                    Modifier
                }
            ) {
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(10.dp))
                        .background(roleColor.copy(alpha = 0.16f))
                        .padding(horizontal = 7.dp, vertical = 2.dp)
                ) {
                    Text(
                        text = badge,
                        fontSize = 10.sp,
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.Bold,
                        color = roleColor
                    )
                }
                Text(
                    text = title,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold,
                    color = textMain,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                if (isPartnerPane && canChangeLang) {
                    Text(
                        text = "Đổi ngôn ngữ ▾",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Medium,
                        color = Color(0xFF0A84FF)
                    )
                } else {
                    Text(
                        text = subtitle,
                        fontSize = 11.sp,
                        color = textSub,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
        }

        // Pane Scroll Feed
        if (messages.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(20.dp),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Box(
                        modifier = Modifier
                            .size(40.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .background(roleColor.copy(alpha = 0.14f)),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Filled.Mic,
                            contentDescription = null,
                            tint = roleColor,
                            modifier = Modifier.size(20.dp)
                        )
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = if (isPartnerPane) {
                            "Đặt màn hình hướng về phía người đối thoại."
                        } else {
                            "Kiểm tra chế độ và ngôn ngữ trước khi bật micro."
                        },
                        fontSize = 12.sp,
                        color = textSub,
                        textAlign = TextAlign.Center
                    )
                }
            }
        } else {
            LazyColumn(
                state = listState,
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 14.dp, vertical = 10.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(messages, key = { it.id }) { msg ->
                    val displayText = when {
                        isScribeNotes -> "• ${msg.translation ?: msg.text}"
                        recordingMode == "scribe" -> msg.text
                        isPartnerPane -> {
                            if (partnerLang == "any" && msg.speaker == "host") {
                                msg.translation ?: msg.text
                            } else if (msg.speaker == "partner") {
                                msg.text
                            } else {
                                msg.translation ?: msg.text
                            }
                        }
                        else -> {
                            if (msg.speaker == "host") {
                                msg.text
                            } else {
                                msg.translation ?: msg.text
                            }
                        }
                    }

                    if (displayText.isNotBlank()) {
                        val isHostSpeaker = msg.speaker == "host"
                        val dotCol = if (isHostSpeaker) Color(0xFF10B981) else Color(0xFF0A84FF)

                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 4.dp)
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(6.dp)
                                        .clip(CircleShape)
                                        .background(dotCol)
                                )
                                Text(
                                    text = if (isHostSpeaker) "Bạn" else title,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = dotCol
                                )
                                Text(
                                    text = formatDurationSeconds((msg.startMs / 1000L).toInt()),
                                    fontSize = 10.sp,
                                    fontFamily = FontFamily.Monospace,
                                    color = textSub
                                )
                            }
                            Spacer(modifier = Modifier.height(3.dp))
                            Text(
                                text = displayText,
                                fontSize = (16f * textScale).sp,
                                lineHeight = (23f * textScale).sp,
                                fontWeight = if (msg.isFinal == 1L) FontWeight.Medium else FontWeight.Normal,
                                color = if (msg.isFinal == 1L) textMain else textSub
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun HistoryScreen(viewModel: SessionViewModel, state: SessionState) {
    val isDark = state.themeMode == "dark"
    val bg = if (isDark) Color(0xFF0B0E14) else Color(0xFFF4F6FA)
    val surface = if (isDark) Color(0xFF131822) else Color(0xFFFFFFFF)
    val surface2 = if (isDark) Color(0xFF1C2331) else Color(0xFFE9EEF5)
    val textMain = if (isDark) Color(0xFFF1F5F9) else Color(0xFF0F172A)
    val textSub = if (isDark) Color(0xFF94A3B8) else Color(0xFF64748B)
    val borderCol = if (isDark) Color.White.copy(alpha = 0.08f) else Color.Black.copy(alpha = 0.08f)

    var showingDetailOnMobile by remember { mutableStateOf(false) }
    var renameDialogSession by remember { mutableStateOf<Session?>(null) }

    val filteredSessions = remember(state.historySessions, state.historySearchQuery) {
        val q = state.historySearchQuery.trim().lowercase()
        if (q.isEmpty()) state.historySessions
        else state.historySessions.filter {
            it.title.lowercase().contains(q) || it.partnerLang.lowercase().contains(q)
        }
    }

    val selectedSession = state.historySessions.find { it.id == state.selectedHistorySessionId }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(bg)
    ) {
        // Header
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(surface)
                .border(1.dp, borderCol)
                .padding(horizontal = 14.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                IconButton(
                    onClick = {
                        if (showingDetailOnMobile) {
                            showingDetailOnMobile = false
                        } else {
                            viewModel.setScreen("session")
                        }
                    },
                    modifier = Modifier.size(32.dp)
                ) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = "Quay lại",
                        tint = textMain
                    )
                }
                Text(
                    text = if (showingDetailOnMobile && selectedSession != null) {
                        selectedSession.title
                    } else {
                        "Lịch sử phiên dịch (${state.historySessions.size})"
                    },
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Bold,
                    color = textMain,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }

            Button(
                onClick = { viewModel.setScreen("session") },
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0A84FF)),
                shape = RoundedCornerShape(16.dp),
                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
            ) {
                Icon(
                    imageVector = Icons.Filled.Mic,
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(14.dp)
                )
                Spacer(modifier = Modifier.width(4.dp))
                Text("Phiên dịch mới", fontSize = 12.sp, color = Color.White)
            }
        }

        if (!showingDetailOnMobile) {
            // Search & Session List
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(14.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                OutlinedTextField(
                    value = state.historySearchQuery,
                    onValueChange = { viewModel.setHistorySearchQuery(it) },
                    placeholder = { Text("Tìm kiếm cuộc hội thoại...") },
                    leadingIcon = {
                        Icon(
                            imageVector = Icons.Filled.Search,
                            contentDescription = null,
                            tint = textSub
                        )
                    },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(14.dp)
                )

                if (filteredSessions.isEmpty()) {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "Chưa có phiên dịch nào được lưu.",
                            fontSize = 13.sp,
                            color = textSub
                        )
                    }
                } else {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        items(filteredSessions, key = { it.id }) { sess ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(16.dp))
                                    .background(surface)
                                    .border(1.dp, borderCol, RoundedCornerShape(16.dp))
                                    .clickable {
                                        viewModel.selectHistorySession(sess.id)
                                        showingDetailOnMobile = true
                                    }
                                    .padding(14.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = sess.title,
                                        fontSize = 14.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = textMain,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                    Spacer(modifier = Modifier.height(4.dp))
                                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                        Text(
                                            text = "${sess.partnerLang.uppercase()} ⇄ VI",
                                            fontSize = 11.sp,
                                            fontFamily = FontFamily.Monospace,
                                            fontWeight = FontWeight.Bold,
                                            color = Color(0xFF0A84FF)
                                        )
                                        Text(
                                            text = formatTimestamp(sess.createdAt),
                                            fontSize = 11.sp,
                                            color = textSub
                                        )
                                    }
                                }

                                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                    IconButton(
                                        onClick = { renameDialogSession = sess },
                                        modifier = Modifier.size(32.dp)
                                    ) {
                                        Icon(
                                            imageVector = Icons.Filled.Edit,
                                            contentDescription = "Đổi tên",
                                            tint = textSub,
                                            modifier = Modifier.size(16.dp)
                                        )
                                    }
                                    IconButton(
                                        onClick = { viewModel.deleteHistorySession(sess.id) },
                                        modifier = Modifier.size(32.dp)
                                    ) {
                                        Icon(
                                            imageVector = Icons.Filled.DeleteOutline,
                                            contentDescription = "Xóa",
                                            tint = Color(0xFFEF4444),
                                            modifier = Modifier.size(16.dp)
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        } else if (selectedSession != null) {
            // Session Detail Transcript View
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(14.dp)
            ) {
                if (state.selectedHistoryMessages.isEmpty()) {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "Phiên hội thoại này chưa có câu thoại nào.",
                            fontSize = 13.sp,
                            color = textSub
                        )
                    }
                } else {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        items(state.selectedHistoryMessages, key = { it.id }) { entry ->
                            val isHost = entry.speaker == "host"
                            val accent = if (isHost) Color(0xFF10B981) else Color(0xFF0A84FF)
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(14.dp))
                                    .background(surface)
                                    .border(1.dp, borderCol, RoundedCornerShape(14.dp))
                                    .padding(12.dp)
                            ) {
                                Row(
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Text(
                                        text = if (isHost) "Bạn (VI)" else "Đối tác (${selectedSession.partnerLang.uppercase()})",
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = accent
                                    )
                                    Text(
                                        text = formatDurationSeconds((entry.startMs / 1000L).toInt()),
                                        fontSize = 11.sp,
                                        fontFamily = FontFamily.Monospace,
                                        color = textSub
                                    )
                                }
                                Spacer(modifier = Modifier.height(6.dp))
                                Text(
                                    text = entry.text,
                                    fontSize = 14.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = textMain
                                )
                                if (!entry.translation.isNullOrBlank()) {
                                    Spacer(modifier = Modifier.height(4.dp))
                                    Box(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .clip(RoundedCornerShape(8.dp))
                                            .background(surface2)
                                            .padding(8.dp)
                                    ) {
                                        Text(
                                            text = entry.translation ?: "",
                                            fontSize = 13.sp,
                                            color = textSub
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    renameDialogSession?.let { target ->
        var draftTitle by remember { mutableStateOf(target.title) }
        Dialog(onDismissRequest = { renameDialogSession = null }) {
            Card(
                shape = RoundedCornerShape(20.dp),
                colors = CardDefaults.cardColors(containerColor = surface),
                border = BorderStroke(1.dp, borderCol)
            ) {
                Column(modifier = Modifier.padding(18.dp)) {
                    Text(
                        text = "Đổi tên phiên dịch",
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold,
                        color = textMain
                    )
                    Spacer(modifier = Modifier.height(10.dp))
                    OutlinedTextField(
                        value = draftTitle,
                        onValueChange = { draftTitle = it },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.End
                    ) {
                        TextButton(onClick = { renameDialogSession = null }) {
                            Text("Hủy", color = textSub)
                        }
                        Button(
                            onClick = {
                                viewModel.renameHistorySession(target.id, draftTitle)
                                renameDialogSession = null
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0A84FF))
                        ) {
                            Text("Lưu", color = Color.White)
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun UpdateOverlay(updateUrl: String) {
    val context = LocalContext.current
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF0B0E14))
            .padding(24.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(24.dp))
                .background(Color(0xFF131822))
                .padding(24.dp)
        ) {
            Icon(
                imageVector = Icons.Filled.Warning,
                contentDescription = null,
                tint = Color(0xFFEF4444),
                modifier = Modifier.size(42.dp)
            )
            Spacer(modifier = Modifier.height(12.dp))
            Text(
                text = "CẬP NHẬT ỨNG DỤNG",
                fontSize = 17.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = "Đã có phiên bản PayLingo mới. Vui lòng cập nhật để tiếp tục sử dụng.",
                fontSize = 13.sp,
                color = Color(0xFF94A3B8),
                textAlign = TextAlign.Center
            )
            Spacer(modifier = Modifier.height(20.dp))
            Button(
                onClick = {
                    try {
                        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(updateUrl)))
                    } catch (_: Exception) {}
                },
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0A84FF)),
                shape = RoundedCornerShape(20.dp),
                modifier = Modifier.fillMaxWidth().height(46.dp)
            ) {
                Text("Tải bản cập nhật", color = Color.White, fontWeight = FontWeight.Bold)
            }
        }
    }
}
