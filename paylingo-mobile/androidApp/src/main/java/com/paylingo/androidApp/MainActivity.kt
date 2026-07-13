package com.paylingo.androidApp

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
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
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.core.content.ContextCompat
import com.paylingo.audio.AndroidAudioRecorder
import com.paylingo.db.DatabaseDriverFactory
import com.paylingo.db.SessionRepository
import com.paylingo.viewmodel.SessionViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    private val requestPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        if (isGranted) {
            // Permission granted
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Request microphone access
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
        }

        // Save Context statically for KMP platformInfo
        com.paylingo.utils.AndroidAppContext.context = applicationContext

        // Initialize shared dependencies
        val driverFactory = DatabaseDriverFactory(applicationContext)
        val repository = SessionRepository(driverFactory)
        val audioRecorder = AndroidAudioRecorder()
        val viewModel = SessionViewModel(audioRecorder, repository, apiKey = "MOCK_SONIOX_KEY")

        setContent {
            MaterialTheme(
                colorScheme = darkColorScheme(
                    background = Color(0xFF09090B),
                    surface = Color(0xFF18181B),
                    primary = Color(0xFF3B82F6)
                )
            ) {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    MainScreen(viewModel)
                }
            }
        }
    }
}

// Partner language representation helper
data class PartnerLanguage(val code: String, val name: String, val flag: String)

val PARTNER_LANGUAGES = listOf(
    PartnerLanguage("any", "Mọi ngôn ngữ (Any)", "🌐"),
    PartnerLanguage("en", "English", "🇬🇧"),
    PartnerLanguage("zh", "中文 (Chinese)", "🇨🇳"),
    PartnerLanguage("ja", "日本語 (Japanese)", "🇯🇵"),
    PartnerLanguage("ko", "한국어 (Korean)", "🇰🇷"),
    PartnerLanguage("es", "Español (Spanish)", "🇪🇸"),
    PartnerLanguage("ru", "Русский (Russian)", "🇷🇺"),
    PartnerLanguage("de", "Deutsch (German)", "🇩🇪"),
    PartnerLanguage("th", "ภาษาไทย (Thai)", "🇹🇭")
)

@Composable
fun UpdateOverlay(updateUrl: String) {
    val context = LocalContext.current
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF09090B))
            .padding(24.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(28.dp))
                .background(Color(0xFF18181B))
                .border(1.dp, Color.White.copy(alpha = 0.05f), RoundedCornerShape(28.dp))
                .padding(28.dp)
        ) {
            Icon(
                imageVector = Icons.Filled.Warning,
                contentDescription = "Warning",
                tint = Color(0xFFEF4444),
                modifier = Modifier.size(48.dp)
            )
            Spacer(modifier = Modifier.height(16.dp))
            Text(
                text = "CẬP NHẬT BẮT BUỘC",
                fontSize = 18.sp,
                fontWeight = FontWeight.Black,
                color = Color(0xFFEF4444)
            )
            Spacer(modifier = Modifier.height(12.dp))
            Text(
                text = "Đã có bản cập nhật mới trên VPS. Vui lòng nâng cấp ứng dụng để tiếp tục sử dụng dịch vụ.",
                fontSize = 13.sp,
                color = Color(0xFFCBD5E1),
                lineHeight = 20.sp,
                textAlign = TextAlign.Center
            )
            Spacer(modifier = Modifier.height(24.dp))
            Button(
                onClick = {
                    try {
                        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(updateUrl))
                        context.startActivity(intent)
                    } catch (e: Exception) {
                        e.printStackTrace()
                    }
                },
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF3B82F6)),
                shape = RoundedCornerShape(24.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp)
            ) {
                Text(
                    text = "TẢI APK MỚI (IN-APP)",
                    fontWeight = FontWeight.Bold,
                    fontSize = 13.sp,
                    color = Color.White
                )
            }
        }
    }
}

@OptIn(ExperimentalAnimationApi::class)
@Composable
fun MainScreen(viewModel: SessionViewModel) {
    val state by viewModel.state.collectAsState()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    if (state.needsUpdate) {
        UpdateOverlay(state.updateUrl)
        return
    }

    // Dynamic toast messages for premium mode changes
    var toastMessage by remember { mutableStateOf<String?>(null) }
    var toastJob by remember { mutableStateOf<kotlinx.coroutines.Job?>(null) }

    fun showModeToast(mode: String) {
        toastJob?.cancel()
        val text = when (mode) {
            "one_way" -> "Dịch một chiều từ ngôn ngữ khác sang Tiếng Việt"
            "two_way" -> "Dịch song ngữ hai chiều trực tiếp giữa bạn và đối tác"
            "scribe" -> "Ghi âm thông minh nguyên bản không qua dịch thuật"
            else -> ""
        }
        toastMessage = text
        toastJob = scope.launch {
            delay(3200)
            toastMessage = null
        }
    }

    var showLanguageDialog by remember { mutableStateOf(false) }
    val selectedPartner = PARTNER_LANGUAGES.find { it.code == state.partnerLang } ?: PARTNER_LANGUAGES[0]

    val logs by com.paylingo.utils.AppLog.logs.collectAsState()
    var showDebugDialog by remember { mutableStateOf(false) }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF09090B))
    ) {
        // Decorative Ambient Glow Blobs in the background
        Canvas(modifier = Modifier.fillMaxSize()) {
            drawCircle(
                color = Color(0xFF3B82F6).copy(alpha = 0.04f),
                radius = size.width * 0.6f,
                center = Offset(0f, 0f)
            )
            drawCircle(
                color = Color(0xFF10B981).copy(alpha = 0.04f),
                radius = size.width * 0.7f,
                center = Offset(size.width, size.height)
            )
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 16.dp, vertical = 20.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // Header Bar
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 16.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                // PayPayLogo Text Representation
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = "PAY",
                        fontSize = 24.sp,
                        fontWeight = FontWeight.Black,
                        color = Color.White
                    )
                    Spacer(modifier = Modifier.width(2.dp))
                    Text(
                        text = "LINGO",
                        fontSize = 24.sp,
                        fontWeight = FontWeight.Black,
                        color = Color(0xFF3B82F6)
                    )
                }

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    // Nickname status badge
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier
                            .clip(RoundedCornerShape(16.dp))
                            .background(Color(0xFF3B82F6).copy(alpha = 0.1f))
                            .border(1.dp, Color(0xFF3B82F6).copy(alpha = 0.2f), RoundedCornerShape(16.dp))
                            .padding(horizontal = 10.dp, vertical = 4.dp),
                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Filled.CheckCircle,
                            contentDescription = "Verified",
                            tint = Color(0xFF3B82F6),
                            modifier = Modifier.size(12.dp)
                        )
                        Text(
                            text = "Khách 🇻🇳",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFF3B82F6)
                        )
                    }

                    // Debug Log Button
                    IconButton(
                        onClick = { showDebugDialog = true },
                        modifier = Modifier
                            .size(28.dp)
                            .clip(CircleShape)
                            .background(Color(0xFFEF4444).copy(alpha = 0.1f))
                            .border(1.dp, Color(0xFFEF4444).copy(alpha = 0.2f), CircleShape)
                    ) {
                        Icon(
                            imageVector = Icons.Filled.Terminal,
                            contentDescription = "Debug Logs",
                            tint = Color(0xFFEF4444),
                            modifier = Modifier.size(14.dp)
                        )
                    }
                }
            }

            // Segmented Capsule Control (Mode Selector) with smooth animated sliding background
            val activeIndex = when (state.recordingMode) {
                "one_way" -> 0
                "two_way" -> 1
                "scribe" -> 2
                else -> 0
            }

            BoxWithConstraints(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(44.dp)
                    .clip(RoundedCornerShape(22.dp))
                    .background(Color.Black.copy(alpha = 0.35f))
                    .border(1.dp, Color.White.copy(alpha = 0.05f), RoundedCornerShape(22.dp))
                    .padding(2.dp)
            ) {
                val maxWidth = maxWidth
                val indicatorWidth = maxWidth / 3
                val targetOffset = indicatorWidth * activeIndex
                val animatedOffset by animateDpAsState(
                    targetValue = targetOffset,
                    animationSpec = spring(stiffness = Spring.StiffnessLow, dampingRatio = Spring.DampingRatioLowBouncy)
                )

                // Sliding background active pill
                Box(
                    modifier = Modifier
                        .offset(x = animatedOffset)
                        .width(indicatorWidth)
                        .fillMaxHeight()
                        .clip(RoundedCornerShape(20.dp))
                        .background(
                            Brush.horizontalGradient(
                                colors = listOf(Color(0xFF3B82F6), Color(0xFF2563EB))
                            )
                        )
                        .shadow(4.dp, RoundedCornerShape(20.dp))
                )

                Row(modifier = Modifier.fillMaxSize()) {
                    val modes = listOf("one_way" to "One Way", "two_way" to "Two Way", "scribe" to "Scribe")
                    modes.forEach { (mode, label) ->
                        val isSelected = state.recordingMode == mode
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .fillMaxHeight()
                                .clip(RoundedCornerShape(20.dp))
                                .clickable(enabled = !state.isRecording) {
                                    viewModel.setMode(mode)
                                    showModeToast(mode)
                                },
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = label,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold,
                                color = if (isSelected) Color.White else Color.Gray
                            )
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Premium Chat Board
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(24.dp))
                    .background(Color(0x33121214))
                    .border(1.dp, Color.White.copy(alpha = 0.03f), RoundedCornerShape(24.dp))
                    .padding(12.dp)
            ) {
                if (state.messages.isEmpty()) {
                    // Clean premium empty state
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(24.dp),
                        verticalArrangement = Arrangement.Center,
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Box(
                            modifier = Modifier
                                .size(56.dp)
                                .clip(CircleShape)
                                .background(Color(0xFF3B82F6).copy(alpha = 0.05f))
                                .border(1.dp, Color(0xFF3B82F6).copy(alpha = 0.1f), CircleShape),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = Icons.Filled.Mic,
                                contentDescription = "Mic",
                                tint = Color(0xFF3B82F6).copy(alpha = 0.4f),
                                modifier = Modifier.size(24.dp)
                            )
                        }
                        Spacer(modifier = Modifier.height(12.dp))
                        Text(
                            text = "Chưa có hội thoại",
                            fontWeight = FontWeight.Black,
                            fontSize = 13.sp,
                            color = Color(0xFF64748B),
                            letterSpacing = 1.sp
                        )
                        Spacer(modifier = Modifier.height(6.dp))
                        Text(
                            text = "Chọn ngôn ngữ đối tác, đặt thiết bị giữa bàn và bấm Bắt đầu dịch.",
                            color = Color(0xFF475569),
                            fontSize = 11.sp,
                            textAlign = TextAlign.Center,
                            lineHeight = 16.sp
                        )
                    }
                } else {
                    val listState = rememberLazyListState()
                    LaunchedEffect(state.messages.size) {
                        listState.animateScrollToItem(state.messages.size - 1)
                    }

                    LazyColumn(
                        state = listState,
                        modifier = Modifier.fillMaxSize(),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        items(state.messages) { msg ->
                            val isHost = msg.speaker == "host"
                            val speakerColor = if (isHost) Color(0xFF3B82F6) else Color(0xFF10B981)
                            val speakerName = if (isHost) "Bạn" else selectedPartner.name
                            val speakerFlag = if (isHost) "🇻🇳" else selectedPartner.flag

                            Column(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalAlignment = Alignment.Start
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                                    modifier = Modifier.padding(start = 6.dp, bottom = 2.dp)
                                ) {
                                    Text(
                                        text = "$speakerName $speakerFlag",
                                        color = speakerColor.copy(alpha = 0.8f),
                                        fontSize = 10.sp,
                                        fontWeight = FontWeight.Black
                                    )
                                    if (msg.isFinal == 0L) {
                                        Text(
                                            text = "• Đang nhận diện...",
                                            color = Color.Gray,
                                            fontSize = 9.sp,
                                            fontWeight = FontWeight.Bold
                                        )
                                    }
                                }

                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth(0.9f)
                                        .clip(RoundedCornerShape(18.dp))
                                        .background(
                                            Brush.linearGradient(
                                                colors = if (isHost) {
                                                    listOf(Color(0xFF3B82F6).copy(alpha = 0.12f), Color(0xFF3B82F6).copy(alpha = 0.03f))
                                                } else {
                                                    listOf(Color(0xFF10B981).copy(alpha = 0.12f), Color(0xFF10B981).copy(alpha = 0.03f))
                                                }
                                            )
                                        )
                                        .border(
                                            1.dp,
                                            if (isHost) Color(0xFF3B82F6).copy(alpha = 0.15f) else Color(0xFF10B981).copy(alpha = 0.15f),
                                            RoundedCornerShape(18.dp)
                                        )
                                        .padding(12.dp)
                                ) {
                                    Column {
                                        // Original text spoken
                                        Text(
                                            text = msg.text,
                                            color = Color.White,
                                            fontSize = 14.sp,
                                            fontWeight = FontWeight.Bold,
                                            lineHeight = 19.sp
                                        )
                                        
                                        // Translated translation text
                                        msg.translation?.let { trans ->
                                            if (trans.isNotEmpty()) {
                                                Spacer(modifier = Modifier.height(6.dp))
                                                Text(
                                                    text = trans,
                                                    color = Color(0xFFCBD5E1),
                                                    fontSize = 12.sp,
                                                    fontWeight = FontWeight.Medium,
                                                    lineHeight = 17.sp
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

            Spacer(modifier = Modifier.height(16.dp))

            // Footer Control Board
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(24.dp))
                    .background(Color.Black.copy(alpha = 0.25f))
                    .border(1.dp, Color.White.copy(alpha = 0.05f), RoundedCornerShape(24.dp))
                    .padding(12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                // Pulsing dot connection status
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    val statusColor = if (state.isRecording) Color(0xFFEF4444) else Color(0xFF64748B)

                    Box(
                        modifier = Modifier.size(12.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        if (state.isRecording) {
                            val infiniteTransition = rememberInfiniteTransition()
                            val pulseScale by infiniteTransition.animateFloat(
                                initialValue = 1f,
                                targetValue = 2.2f,
                                animationSpec = infiniteRepeatable(
                                    animation = tween(1200, easing = LinearEasing),
                                    repeatMode = RepeatMode.Restart
                                )
                            )
                            val pulseAlpha by infiniteTransition.animateFloat(
                                initialValue = 0.6f,
                                targetValue = 0f,
                                animationSpec = infiniteRepeatable(
                                    animation = tween(1200, easing = LinearEasing),
                                    repeatMode = RepeatMode.Restart
                                )
                            )
                            Box(
                                modifier = Modifier
                                    .size(12.dp)
                                    .scale(pulseScale)
                                    .clip(CircleShape)
                                    .background(statusColor.copy(alpha = pulseAlpha))
                            )
                        }

                        Box(
                            modifier = Modifier
                                .size(7.dp)
                                .clip(CircleShape)
                                .background(statusColor)
                        )
                    }

                    Column {
                        Text(
                            text = if (state.isRecording) "ĐANG GHI" else "ĐANG CHỜ",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Black,
                            color = Color.White,
                            letterSpacing = 0.5.sp
                        )
                        Text(
                            text = if (state.isRecording) "KẾT NỐI ỔN ĐỊNH" else "AUDIO KHÓA",
                            fontSize = 8.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFF475569)
                        )
                    }
                }

                // Partner language selector dropdown pill button
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .clip(RoundedCornerShape(16.dp))
                        .background(Color.White.copy(alpha = 0.05f))
                        .border(1.dp, Color.White.copy(alpha = 0.1f), RoundedCornerShape(16.dp))
                        .clickable(enabled = !state.isRecording) { showLanguageDialog = true }
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Icon(
                        imageVector = Icons.Filled.Language,
                        contentDescription = "Language",
                        tint = Color(0xFF10B981),
                        modifier = Modifier.size(14.dp)
                    )
                    Text(
                        text = "${selectedPartner.flag} ${selectedPartner.name.split(" ")[0]}",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color.White
                    )
                    Icon(
                        imageVector = Icons.Filled.ArrowDropDown,
                        contentDescription = "Dropdown",
                        tint = Color.Gray,
                        modifier = Modifier.size(12.dp)
                    )
                }

                // Beautiful Action Button (Start / Stop Recording)
                val buttonBrush = if (state.isRecording) {
                    Brush.horizontalGradient(colors = listOf(Color(0xFFEF4444), Color(0xFFDC2626)))
                } else {
                    Brush.horizontalGradient(colors = listOf(Color(0xFF3B82F6), Color(0xFF10B981)))
                }

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .clip(RoundedCornerShape(18.dp))
                        .background(buttonBrush)
                        .clickable {
                            if (state.isRecording) {
                                viewModel.stopSession()
                            } else {
                                viewModel.startSession()
                            }
                        }
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Icon(
                        imageVector = if (state.isRecording) Icons.Filled.Stop else Icons.Filled.Mic,
                        contentDescription = "Action",
                        tint = Color.White,
                        modifier = Modifier.size(14.dp)
                    )
                    Text(
                        text = if (state.isRecording) "DỪNG" else "BẮT ĐẦU",
                        fontWeight = FontWeight.Black,
                        fontSize = 11.sp,
                        color = Color.White,
                        letterSpacing = 0.5.sp
                    )
                }
            }
        }

        // Animated Glassmorphic Mode Change Toast
        AnimatedVisibility(
            visible = toastMessage != null,
            enter = fadeIn() + slideInVertically(initialOffsetY = { it / 2 }),
            exit = fadeOut() + slideOutVertically(targetOffsetY = { it / 2 }),
            modifier = Modifier
                .padding(bottom = 100.dp)
                .align(Alignment.BottomCenter)
        ) {
            toastMessage?.let { msg ->
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(20.dp))
                        .background(Color(0xE618181B))
                        .border(1.dp, Color.White.copy(alpha = 0.1f), RoundedCornerShape(20.dp))
                        .padding(horizontal = 16.dp, vertical = 10.dp)
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Filled.Info,
                            contentDescription = "Info",
                            tint = Color(0xFF3B82F6),
                            modifier = Modifier.size(14.dp)
                        )
                        Text(
                            text = msg,
                            color = Color.White,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }
        }

        // Premium Language Selector Modal Dialog
        if (showLanguageDialog) {
            Dialog(onDismissRequest = { showLanguageDialog = false }) {
                Card(
                    modifier = Modifier
                        .fillMaxWidth(0.95f)
                        .wrapContentHeight(),
                    shape = RoundedCornerShape(24.dp),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFF18181B)),
                    border = BorderStroke(1.dp, Color.White.copy(alpha = 0.08f))
                ) {
                    Column(
                        modifier = Modifier.padding(20.dp),
                        horizontalAlignment = Alignment.Start
                    ) {
                        Text(
                            text = "CHỌN NGÔN NGỮ ĐỐI TÁC",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Black,
                            color = Color.Gray,
                            letterSpacing = 1.sp
                        )
                        Spacer(modifier = Modifier.height(16.dp))

                        LazyColumn(
                            verticalArrangement = Arrangement.spacedBy(6.dp),
                            modifier = Modifier.height(280.dp)
                        ) {
                            items(PARTNER_LANGUAGES) { lang ->
                                val isSelected = lang.code == state.partnerLang
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clip(RoundedCornerShape(12.dp))
                                        .background(if (isSelected) Color(0xFF3B82F6).copy(alpha = 0.1f) else Color.Transparent)
                                        .clickable {
                                            viewModel.setPartnerLanguage(lang.code)
                                            showLanguageDialog = false
                                        }
                                        .padding(horizontal = 14.dp, vertical = 12.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                                    ) {
                                        Text(text = lang.flag, fontSize = 18.sp)
                                        Text(
                                            text = lang.name,
                                            fontSize = 13.sp,
                                            fontWeight = if (isSelected) FontWeight.Black else FontWeight.Bold,
                                            color = if (isSelected) Color.White else Color(0xFFCBD5E1)
                                        )
                                    }
                                    if (isSelected) {
                                        Icon(
                                            imageVector = Icons.Filled.Check,
                                            contentDescription = "Selected",
                                            tint = Color(0xFF3B82F6),
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

        // Premium Debug Logs Viewer Dialog
        if (showDebugDialog) {
            Dialog(onDismissRequest = { showDebugDialog = false }) {
                Card(
                    modifier = Modifier
                        .fillMaxWidth(0.98f)
                        .fillMaxHeight(0.85f),
                    shape = RoundedCornerShape(24.dp),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFF18181B)),
                    border = BorderStroke(1.dp, Color.White.copy(alpha = 0.08f))
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(16.dp),
                        horizontalAlignment = Alignment.Start
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "HỆ THỐNG DEBUG LOGS",
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Black,
                                color = Color.Gray,
                                letterSpacing = 1.sp
                            )
                            IconButton(onClick = { showDebugDialog = false }) {
                                Icon(
                                    imageVector = Icons.Filled.Close,
                                    contentDescription = "Close",
                                    tint = Color.Gray,
                                    modifier = Modifier.size(16.dp)
                                )
                            }
                        }
                        
                        Spacer(modifier = Modifier.height(10.dp))

                        // Scrollable logs area
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(12.dp))
                                .background(Color.Black)
                                .border(1.dp, Color.White.copy(alpha = 0.05f), RoundedCornerShape(12.dp))
                                .padding(8.dp)
                        ) {
                            if (logs.isEmpty()) {
                                Box(
                                    modifier = Modifier.fillMaxSize(),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text(
                                        text = "Chưa có logs hệ thống...",
                                        color = Color.DarkGray,
                                        fontSize = 11.sp
                                    )
                                }
                            } else {
                                LazyColumn(modifier = Modifier.fillMaxSize()) {
                                    items(logs) { logLine ->
                                        val isError = logLine.startsWith("[ERROR]")
                                        val textColor = if (isError) Color(0xFFEF4444) else Color(0xFF4ADE80)
                                        Text(
                                            text = logLine,
                                            color = textColor,
                                            fontSize = 10.sp,
                                            fontFamily = FontFamily.Monospace,
                                            modifier = Modifier.padding(vertical = 2.dp)
                                        )
                                    }
                                }
                            }
                        }

                        Spacer(modifier = Modifier.height(12.dp))

                        // Actions Row (Clear, Copy, Close)
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            Button(
                                onClick = { com.paylingo.utils.AppLog.clear() },
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF475569)),
                                shape = RoundedCornerShape(12.dp),
                                modifier = Modifier.weight(1f)
                            ) {
                                Icon(
                                    imageVector = Icons.Filled.Delete,
                                    contentDescription = "Clear",
                                    modifier = Modifier.size(14.dp)
                                )
                                Spacer(modifier = Modifier.width(4.dp))
                                Text("Xóa", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                            }

                            val clipboardManager = context.getSystemService(android.content.Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
                            Button(
                                onClick = {
                                    val allLogsText = logs.joinToString("\n")
                                    val clipData = android.content.ClipData.newPlainText("Pay Lingo Debug Logs", allLogsText)
                                    clipboardManager.setPrimaryClip(clipData)
                                    scope.launch {
                                        toastMessage = "Đã copy toàn bộ debug logs!"
                                        delay(2500)
                                        toastMessage = null
                                    }
                                },
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF3B82F6)),
                                shape = RoundedCornerShape(12.dp),
                                modifier = Modifier.weight(1f)
                            ) {
                                Icon(
                                    imageVector = Icons.Filled.ContentCopy,
                                    contentDescription = "Copy",
                                    modifier = Modifier.size(14.dp)
                                )
                                Spacer(modifier = Modifier.width(4.dp))
                                Text("Copy Logs", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            }
        }
    }
}
