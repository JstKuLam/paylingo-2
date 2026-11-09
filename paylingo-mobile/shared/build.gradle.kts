plugins {
    kotlin("multiplatform")
    id("com.android.library")
    id("app.cash.sqldelight")
    kotlin("plugin.serialization")
}

kotlin {
    targets.all {
        compilations.all {
            kotlinOptions {
                freeCompilerArgs += "-Xexpect-actual-classes"
            }
        }
    }

    androidTarget {
        compilations.all {
            kotlinOptions {
                jvmTarget = "1.8"
            }
        }
    }
    
    listOf(
        iosX64(),
        iosArm64(),
        iosSimulatorArm64()
    ).forEach {
        it.binaries.framework {
            baseName = "shared"
            isStatic = true
        }
    }

    sourceSets {
        commonMain.dependencies {
            // Coroutines
            implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.8.0")
            // Ktor
            implementation("io.ktor:ktor-client-core:2.3.9")
            implementation("io.ktor:ktor-client-websockets:2.3.9")
            implementation("io.ktor:ktor-client-content-negotiation:2.3.9")
            implementation("io.ktor:ktor-serialization-kotlinx-json:2.3.9")
            // SQLDelight
            implementation("app.cash.sqldelight:runtime:2.0.1")
        }

        commonTest.dependencies {
            implementation(kotlin("test"))
        }
        
        androidMain.dependencies {
            implementation("app.cash.sqldelight:android-driver:2.0.1")
            implementation("io.ktor:ktor-client-okhttp:2.3.9")
        }
        
        iosMain.dependencies {
            implementation("app.cash.sqldelight:native-driver:2.0.1")
            implementation("io.ktor:ktor-client-darwin:2.3.9")
        }
    }
}

android {
    namespace = "com.paylingo.shared"
    compileSdk = 34
    defaultConfig {
        minSdk = 24
    }
}

sqldelight {
    databases {
        create("AppDatabase") {
            packageName.set("com.paylingo.db")
        }
    }
}
