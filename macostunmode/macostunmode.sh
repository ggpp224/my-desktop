#!/bin/bash

# macostunmode.sh - 自动化管理 sing-box for macOS 的shell脚本

# --- 颜色定义 ---
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

# --- 全局变量 ---
SCRIPT_DIR="/usr/local/macostunmode"
SING_BOX_EXECUTABLE=""
CONFIG_MODE_FILE="config_mode.txt" # 保存当前模式 (whitelist/global)
CONFIG_FILE="" # 将根据模式选择
SERVICE_NAME="com.nekohasekai.sing-box"
SERVICE_FILE="/Library/LaunchDaemons/${SERVICE_NAME}.plist"
SUB_URL_FILE="config_sub_url.txt"
CURRENT_SERVER_FILE="current_server.txt"
SUB_CACHE_FILE="subscription_cache.b64"
INCLUDE_KEYWORDS=("优化" "下载用" "兼容节点" "tun模式") # 只保留包含这些关键词的服务器

# --- 核心功能函数 ---

# 检查是否为root用户
check_root() {
    if [ "$(id -u)" != "0" ]; then
        echo -e "${YELLOW}警告: 本脚本的大部分操作需要管理员权限，将自动使用 'sudo'。${NC}"
    fi
}

# 封装sudo命令
sudo_cmd() {
    if [ "$(id -u)" != "0" ]; then
        sudo "$@"
    else
        "$@"
    fi
}

# 启动前检测并关闭系统代理（HTTP/HTTPS/SOCKS5）
disable_system_proxies_if_enabled() {
    if ! command -v networksetup >/dev/null 2>&1; then
        echo -e "${YELLOW}未找到 networksetup，跳过系统代理检测。${NC}"
        return
    fi

    echo "正在检测系统代理状态（HTTP/HTTPS/SOCKS5）..."
    local services
    services=$(networksetup -listallnetworkservices 2>/dev/null | sed '1d;/^\*/d;/^$/d')
    if [ -z "$services" ]; then
        echo -e "${YELLOW}未检测到可用网络服务，跳过系统代理检测。${NC}"
        return
    fi

    local has_enabled_proxy=0
    local proxy_summary=""
    while IFS= read -r service; do
        [ -z "$service" ] && continue

        local web_enabled secure_enabled socks_enabled
        web_enabled=$(networksetup -getwebproxy "$service" 2>/dev/null | awk -F': ' '/^Enabled:/ {print $2; exit}')
        secure_enabled=$(networksetup -getsecurewebproxy "$service" 2>/dev/null | awk -F': ' '/^Enabled:/ {print $2; exit}')
        socks_enabled=$(networksetup -getsocksfirewallproxy "$service" 2>/dev/null | awk -F': ' '/^Enabled:/ {print $2; exit}')

        if [ "$web_enabled" = "Yes" ]; then
            has_enabled_proxy=1
            proxy_summary="${proxy_summary}\n- ${service}: HTTP"
        fi
        if [ "$secure_enabled" = "Yes" ]; then
            has_enabled_proxy=1
            proxy_summary="${proxy_summary}\n- ${service}: HTTPS"
        fi
        if [ "$socks_enabled" = "Yes" ]; then
            has_enabled_proxy=1
            proxy_summary="${proxy_summary}\n- ${service}: SOCKS5"
        fi
    done <<< "$services"

    if [ "$has_enabled_proxy" -eq 0 ]; then
        echo -e "${GREEN}系统代理状态正常（HTTP/HTTPS/SOCKS5 均未启用）。${NC}"
        return
    fi

    echo -e "${YELLOW}检测到以下系统代理已启用:${NC}"
    echo -e "$proxy_summary"
    read -p "是否在启动前关闭这些系统代理？(tun脚本和v2rayx系统代理只能二选一，否则会导致流量套娃，也可以在v2客户端顶栏菜单手动关闭服务)[y/N]: " confirm_disable_proxy
    if [[ "$confirm_disable_proxy" != "y" && "$confirm_disable_proxy" != "Y" ]]; then
        echo -e "${YELLOW}已跳过关闭系统代理。${NC}"
        return
    fi

    local changed=0
    while IFS= read -r service; do
        [ -z "$service" ] && continue

        local web_enabled secure_enabled socks_enabled
        web_enabled=$(networksetup -getwebproxy "$service" 2>/dev/null | awk -F': ' '/^Enabled:/ {print $2; exit}')
        secure_enabled=$(networksetup -getsecurewebproxy "$service" 2>/dev/null | awk -F': ' '/^Enabled:/ {print $2; exit}')
        socks_enabled=$(networksetup -getsocksfirewallproxy "$service" 2>/dev/null | awk -F': ' '/^Enabled:/ {print $2; exit}')

        if [ "$web_enabled" = "Yes" ]; then
            echo -e "${YELLOW}检测到 ${service} 已启用 HTTP 代理，正在关闭...${NC}"
            sudo_cmd networksetup -setwebproxystate "$service" off
            changed=1
        fi
        if [ "$secure_enabled" = "Yes" ]; then
            echo -e "${YELLOW}检测到 ${service} 已启用 HTTPS 代理，正在关闭...${NC}"
            sudo_cmd networksetup -setsecurewebproxystate "$service" off
            changed=1
        fi
        if [ "$socks_enabled" = "Yes" ]; then
            echo -e "${YELLOW}检测到 ${service} 已启用 SOCKS5 代理，正在关闭...${NC}"
            sudo_cmd networksetup -setsocksfirewallproxystate "$service" off
            changed=1
        fi
    done <<< "$services"

    if [ "$changed" -eq 1 ]; then
        echo -e "${GREEN}系统代理已处理完成（已关闭已启用的 HTTP/HTTPS/SOCKS5 代理）。${NC}"
    fi
}

# 检查并处理 Gatekeeper
check_and_disable_gatekeeper() {
    echo "正在检查 Gatekeeper 状态..."
    local status
    status=$(sudo_cmd spctl --status)

    if [[ "$status" == "assessments enabled" ]]; then
        echo -e "${YELLOW}警告: Gatekeeper 已开启 (assessments enabled)。${NC}"
        echo "开启状态: 允许运行应用从App Store和被认可的开发者"
        echo "禁止状态: 允许运行应用从任意来源"
        echo "目前为开启状态, 会阻止 sing-box 核心程序的运行。"
        local confirm=""
        if [ "${MACOSTUNMODE_AUTO_GATEKEEPER:-0}" = "1" ]; then
            confirm="y"
            echo -e "${YELLOW}已自动确认：尝试禁用 Gatekeeper（MACOSTUNMODE_AUTO_GATEKEEPER=1）。${NC}"
        else
            read -p "是否允许脚本尝试使用 'sudo spctl --master-disable' 将其禁用？[y/N]: " confirm
        fi
        
        if [[ "$confirm" == "y" || "$confirm" == "Y" ]]; then
            echo "正在尝试禁用 Gatekeeper..."
            sudo_cmd spctl --master-disable
            local new_status
            new_status=$(sudo_cmd spctl --status)
            if [[ "$new_status" == "assessments disabled" ]]; then
                echo -e "${GREEN}Gatekeeper 已成功禁用。${NC}"
            else
                echo -e "${RED}禁用 Gatekeeper 失败，后续步骤可能无法正常工作。${NC}"
            fi
        else
            echo -e "${YELLOW}操作已取消。请注意，sing-box 可能无法正常启动。${NC}"
        fi
    else
        echo -e "${GREEN}Gatekeeper 状态正常 (assessments disabled)。${NC}"
    fi
}

# 检查和初始化环境
initialize_environment() {
    echo "正在检查和初始化环境..."
    local target_dir="$SCRIPT_DIR" # SCRIPT_DIR is /usr/local/macostunmode
    local controller_dir
    controller_dir=$(cd "$(dirname "$0")" && pwd)
    
    echo "程序目录 (目标): ${target_dir}"
    echo "控制器目录 (当前): ${controller_dir}"

    # 1. 确保目标目录存在
    if [ ! -d "$target_dir" ]; then
        echo -e "${YELLOW}程序目录不存在，正在尝试创建...${NC}"
        sudo_cmd mkdir -p "$target_dir"
        if [ $? -ne 0 ]; then
            echo -e "${RED}创建目录 '${target_dir}' 失败，请检查权限。${NC}"
            exit 1
        fi
        echo -e "${GREEN}成功创建目录。${NC}"
    fi

    # 2. 检查并执行自动复制（如果需要）
    local required_items=("config_global.json" "config_whitelist.json" "sing-box-macos11-" "sing-box-macos12+" "srss")
    local migration_needed=false
    for item in "${required_items[@]}"; do
        if [ ! -e "${target_dir}/${item}" ] && [ -e "${controller_dir}/${item}" ]; then
            migration_needed=true
            break
        fi
    done

    if [ "$migration_needed" = true ]; then
        echo -e "${YELLOW}检测到核心文件不在目标位置，将执行自动复制...${NC}"
        for item in "${required_items[@]}"; do
            if [ -e "${controller_dir}/${item}" ]; then
                echo "  - 正在复制: $item"
                sudo_cmd cp -r "${controller_dir}/${item}" "${target_dir}/"
                if [ $? -ne 0 ]; then
                    echo -e "${RED}  - 复制失败: $item${NC}"
                    exit 1
                fi
            fi
        done
        echo -e "${GREEN}文件自动复制成功！${NC}"
    fi

    # 3. 无条件权限检查和修正 (核心修复)
    # 确定需要赋予权限的用户名
    local user_account
    if [ -n "$SUDO_USER" ]; then
        user_account="$SUDO_USER"
    else
        user_account=$(whoami)
    fi

    if [ -n "$user_account" ] && [ "$user_account" != "root" ]; then
        # 使用 find 检查目录内是否存在任何 root 拥有的文件/目录，这比只检查顶级目录更可靠
        local root_owned_item
        root_owned_item=$(find "$target_dir" -user root -print -quit)

        if [ -n "$root_owned_item" ]; then
            echo -e "${YELLOW}检测到程序目录中存在权限不一致的文件/目录 (例如: ${root_owned_item})。${NC}"
            echo "正在修正权限，确保用户 ${user_account} 拥有所有权..."
            local user_group
            user_group=$(id -gn "$user_account")
            sudo_cmd chown -R "$user_account:$user_group" "$target_dir"
            echo -e "${GREEN}权限修正完成。${NC}"
        fi
    fi

    # 4. 最终文件存在性检查
    echo "正在进行最终环境检查..."
    local all_items_found=true
    for item in "${required_items[@]}"; do
        if [ ! -e "${target_dir}/${item}" ]; then
            echo -e "${RED}错误: 核心文件或目录缺失: ${target_dir}/${item}${NC}"
            all_items_found=false
        fi
    done

    if [ "$all_items_found" = false ]; then
        echo -e "\n${RED}环境初始化失败。请确保核心文件位于 ${target_dir} 或 ${controller_dir} 中。${NC}"
        exit 1
    fi

    echo -e "${GREEN}环境检查通过。所有核心文件均已就位。${NC}"
}

# 检测macOS版本并设置sing-box可执行文件
detect_macos_version_and_set_executable() {
    local os_version=$(sw_vers -productVersion)
    local major_version=$(echo "$os_version" | cut -d. -f1)

    echo "检测到 macOS 版本: $os_version"

    if [ "$major_version" -ge 12 ]; then
        echo "版本 >= 12，使用 'sing-box-macos12+'"
        SING_BOX_EXECUTABLE="${SCRIPT_DIR}/sing-box-macos12+"
    else
        echo "版本 < 12，使用 'sing-box-macos11-'"
        SING_BOX_EXECUTABLE="${SCRIPT_DIR}/sing-box-macos11-"
    fi

    if [ ! -f "$SING_BOX_EXECUTABLE" ]; then
        echo -e "${RED}错误: 未找到对应的 sing-box 可执行文件: $SING_BOX_EXECUTABLE${NC}"
        exit 1
    fi
    # 赋予执行权限
    sudo_cmd chmod +x "$SING_BOX_EXECUTABLE"
}

# 选择配置模式 (白名单/全局)
select_mode() {
    echo "请选择代理模式:"
    echo "1. 白名单 (config_whitelist.json)"
    echo "2. 全局 (config_global.json)"
    read -p "请输入选项数字: " choice

    case "$choice" in
        1)
            echo "whitelist" > "${SCRIPT_DIR}/${CONFIG_MODE_FILE}"
            echo -e "${GREEN}模式已切换为: 白名单${NC}"
            ;;
        2)
            echo "global" > "${SCRIPT_DIR}/${CONFIG_MODE_FILE}"
            echo -e "${GREEN}模式已切换为: 全局${NC}"
            ;;
        *)
            echo -e "${RED}无效的选项。${NC}"
            return 1
            ;;
    esac
    load_config
    return 0
}

# 加载当前配置
load_config() {
    if [ ! -f "${SCRIPT_DIR}/${CONFIG_MODE_FILE}" ]; then
        echo "whitelist" > "${SCRIPT_DIR}/${CONFIG_MODE_FILE}" # 默认为白名单
    fi
    local mode=$(cat "${SCRIPT_DIR}/${CONFIG_MODE_FILE}")
    if [ "$mode" == "global" ]; then
        CONFIG_FILE="${SCRIPT_DIR}/config_global.json"
    else
        CONFIG_FILE="${SCRIPT_DIR}/config_whitelist.json"
    fi
}

# 获取订阅链接
get_subscription_url() {
    read -p "请输入您的订阅链接: " sub_url
    if [ -z "$sub_url" ]; then
        echo -e "${RED}订阅链接不能为空。${NC}"
        return 1
    fi
    echo "$sub_url" > "${SCRIPT_DIR}/${SUB_URL_FILE}"
    echo -e "${GREEN}订阅链接已保存。${NC}"
    return 0
}

# 更新服务器配置
update_server_config() {
    if [ ! -s "${SCRIPT_DIR}/${SUB_URL_FILE}" ]; then
        echo -e "${YELLOW}未找到或订阅链接为空，请先输入。${NC}"
        if ! get_subscription_url; then
            return
        fi
    fi

    local sub_url
    sub_url=$(cat "${SCRIPT_DIR}/${SUB_URL_FILE}")

    # --- 构造包含详细系统信息的URL参数 ---
    # 1. 获取详细信息
    local model
    model=$(system_profiler SPHardwareDataType | awk '/Model Identifier/ {print $3}')
    local version
    version=$(sw_vers -productVersion)
    local build
    build=$(sw_vers -buildVersion)
    local detailed_info="${model} Version ${version} (Build ${build})"
    
    # 2. 清理字符串以便用于URL (空格替换为 %20)
    local sanitized_info
    sanitized_info=$(echo "$detailed_info" | sed 's/ /%20/g')

    # 3. 附加参数
    local full_sub_url
    if [[ "$sub_url" == *\?* ]]; then
        full_sub_url="${sub_url}&name=${sanitized_info}&macostunmode=true"
    else
        full_sub_url="${sub_url}?name=${sanitized_info}&macostunmode=true"
    fi
    
    echo "正在从以下链接获取订阅信息..."
    echo "$full_sub_url"
    
    local cache_file="${SCRIPT_DIR}/${SUB_CACHE_FILE}"
    local cached_data_b64=""
    if [ -s "$cache_file" ]; then
        cached_data_b64=$(cat "$cache_file")
    fi

    local server_data_b64
    local data_source="online"
    server_data_b64=$(curl -fsSL "$full_sub_url" 2>/dev/null)
    local curl_exit_code=$?

    if [ $curl_exit_code -ne 0 ] || [ -z "$server_data_b64" ]; then
        echo -e "${YELLOW}在线拉取订阅失败，尝试读取本地缓存...${NC}"
        if [ -n "$cached_data_b64" ]; then
            server_data_b64="$cached_data_b64"
            data_source="cache"
            echo -e "${GREEN}已读取本地缓存继续处理。${NC}"
        else
            echo -e "${RED}获取订阅信息失败，且本地无可用缓存。${NC}"
            return
        fi
    fi

    # macOS's base64 uses -D for decoding
    local server_list_vmess
    server_list_vmess=$(echo "$server_data_b64" | base64 -D 2>/dev/null)
    if [ $? -ne 0 ] || [ -z "$server_list_vmess" ]; then
        if [ "$data_source" = "online" ] && [ -n "$cached_data_b64" ]; then
            echo -e "${YELLOW}在线订阅解析失败，回退使用本地缓存...${NC}"
            server_data_b64="$cached_data_b64"
            data_source="cache"
            server_list_vmess=$(echo "$server_data_b64" | base64 -D 2>/dev/null)
        fi

        if [ $? -ne 0 ] || [ -z "$server_list_vmess" ]; then
            echo -e "${RED}解析订阅内容失败，请确认订阅链接或缓存内容是否为base64编码。${NC}"
            return
        fi
    fi

    if [ "$data_source" = "online" ]; then
        echo "$server_data_b64" > "$cache_file"
        echo -e "${GREEN}订阅缓存已更新。${NC}"
    else
        echo -e "${YELLOW}当前使用本地缓存数据。${NC}"
    fi

    declare -a servers_ps
    declare -a servers_info

    while IFS= read -r line; do
        if [[ "$line" == vmess://* ]]; then
            # macOS's base64 uses -D for decoding
            local vmess_data=$(echo "${line#vmess://}" | base64 -D 2>/dev/null)
            if [ $? -eq 0 ] && [ -n "$vmess_data" ]; then
                # 使用 grep 和 sed 的组合，兼容 macOS
                local ps=$(echo "$vmess_data" | grep -o '"ps": *"[^"]*"' | sed -E 's/.*"ps": *"([^"]+)".*/\1/')
                
                # 只保留包含特定关键词的节点
                local keep=0
                for keyword in "${INCLUDE_KEYWORDS[@]}"; do
                    if [[ "$ps" == *"$keyword"* ]]; then
                        keep=1
                        break
                    fi
                done
                if [ "$keep" -eq 0 ]; then
                    continue # 如果未匹配到任何关键词，则跳过此节点
                fi

                servers_ps+=("$ps")
                servers_info+=("$vmess_data")
            fi
        fi
    done <<< "$server_list_vmess"

    if [ ${#servers_ps[@]} -eq 0 ]; then
        echo -e "${RED}未能在订阅中解析到任何 vmess 服务器信息。${NC}"
        return
    fi

    echo "请选择一个服务器:"
    for i in "${!servers_ps[@]}"; do
        echo "$((i+1)). ${servers_ps[$i]}"
    done

    read -p "请输入选项数字: " choice
    local index=$((choice-1))

    if ! [[ "$choice" =~ ^[0-9]+$ ]] || [ "$index" -lt 0 ] || [ "$index" -ge ${#servers_ps[@]} ]; then
        echo -e "${RED}无效的选项。${NC}"
        return
    fi

    local selected_info=${servers_info[$index]}
    local selected_ps=${servers_ps[$index]}
    # 兼容 macOS 的解析方式
    local selected_add=$(echo "$selected_info" | grep -o '"add": *"[^"]*"' | sed -E 's/.*"add": *"([^"]+)".*/\1/')
    local selected_port=$(echo "$selected_info" | grep -o '"port": *[^,]*' | sed 's/[^0-9]*//g')
    local selected_id=$(echo "$selected_info" | grep -o '"id": *"[^"]*"' | sed -E 's/.*"id": *"([^"]+)".*/\1/')

    echo "您选择了: $selected_ps"
    echo "地址: $selected_add, 端口: $selected_port, UUID: $selected_id"

    # --- 开始批量替换所有配置文件 ---
    local whitelist_config="${SCRIPT_DIR}/config_whitelist.json"
    local global_config="${SCRIPT_DIR}/config_global.json"
    local configs_to_update=()
    if [ -f "$whitelist_config" ]; then configs_to_update+=("$whitelist_config"); fi
    if [ -f "$global_config" ]; then configs_to_update+=("$global_config"); fi

    if [ ${#configs_to_update[@]} -eq 0 ]; then
        echo -e "${RED}错误: 未找到任何配置文件 (config_whitelist.json, config_global.json)。${NC}"
        return
    fi

    for config_path in "${configs_to_update[@]}"; do
        echo "正在更新配置文件: $config_path"
        
        # 1. 备份
        cp "$config_path" "${config_path}.bak"

        # 2. 获取此文件的旧服务器地址
        local old_server_address=$(grep '"server":' "$config_path" | grep '\.' | head -n 1 | sed -E 's/.*"server": *"([^"]+)".*/\1/')

        # 3. 全局替换服务器地址
        if [ -n "$old_server_address" ] && [ -n "$selected_add" ]; then
            sed -i '.bak' "s/\"${old_server_address}\"/\"${selected_add}\"/g" "$config_path"
        fi

        # 4. & 5. 定位 server 行，并替换其后的 port 和 uuid 行
        sed -i '.bak' -E "
            /\"server\": *\"${selected_add}\"/ {
                n
                s/(\"server_port\": *)[0-9]*/\1${selected_port}/
                n
                s/(\"uuid\": *\").*(\")/\1${selected_id}\2/
            }
        " "$config_path"

        # 检查替换是否成功
        local update_failed=0
        if ! grep -q "\"server\": *\"${selected_add}\"" "$config_path"; then
            echo -e "${RED}错误: [$config_path] 更新服务器地址失败！${NC}"
            update_failed=1
        fi
        if ! grep -q "\"server_port\": *${selected_port}" "$config_path"; then
            echo -e "${RED}错误: [$config_path] 更新端口号失败！${NC}"
            update_failed=1
        fi
        if ! grep -q "\"uuid\": *\"${selected_id}\"" "$config_path"; then
            echo -e "${RED}错误: [$config_path] 更新UUID失败！${NC}"
            update_failed=1
        fi

        if [ "$update_failed" -eq 1 ]; then
            echo -e "${RED}正在从备份恢复 $config_path ...${NC}"
            mv "${config_path}.bak" "$config_path"
        else
            echo -e "${GREEN}[$config_path] 更新成功！${NC}"
            rm -f "${config_path}.bak"
        fi
    done

    # --- 批量替换结束 ---

    echo "ps=${selected_ps}" > "${SCRIPT_DIR}/${CURRENT_SERVER_FILE}"
    echo "add=${selected_add}" >> "${SCRIPT_DIR}/${CURRENT_SERVER_FILE}"

    echo -e "${GREEN}所有配置文件更新完毕！${NC}"
    
    echo "正在重启服务以应用新配置..."
    restart_service
}

# 创建 launchd 服务文件
create_launchd_service_file() {
    echo "正在创建 launchd 服务文件..."
    local service_content="<?xml version=\"1.0\" encoding=\"UTF-8\"?>
<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">
<plist version=\"1.0\">
<dict>
    <key>Label</key>
    <string>${SERVICE_NAME}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${SING_BOX_EXECUTABLE}</string>
        <string>run</string>
        <string>-c</string>
        <string>${CONFIG_FILE}</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>ENABLE_DEPRECATED_SPECIAL_OUTBOUNDS</key>
        <string>true</string>
    </dict>
    <key>WorkingDirectory</key>
    <string>${SCRIPT_DIR}</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/var/log/sing-box.log</string>
    <key>StandardErrorPath</key>
    <string>/var/log/sing-box.err</string>
    <key>UserName</key>
    <string>root</string>
</dict>
</plist>"

    # 写入临时文件到程序目录，以避免/tmp的权限问题
    local temp_plist="${SCRIPT_DIR}/${SERVICE_NAME}.plist"
    echo "$service_content" > "$temp_plist"

    echo "移动服务文件到 /Library/LaunchDaemons/ 并设置权限..."
    sudo_cmd mv "$temp_plist" "$SERVICE_FILE"
    if [ $? -ne 0 ]; then
        echo -e "${RED}移动服务文件失败。${NC}"
        return 1
    fi
    sudo_cmd chown root:wheel "$SERVICE_FILE"
    sudo_cmd chmod 644 "$SERVICE_FILE"
    echo -e "${GREEN}服务文件创建成功。${NC}"
    return 0
}

# 启动服务
start_service() {
    disable_system_proxies_if_enabled

    if [ ! -f "$SERVICE_FILE" ]; then
        echo -e "${YELLOW}服务文件不存在，正在为您创建...${NC}"
        if ! create_launchd_service_file; then
            echo -e "${RED}创建服务文件失败，无法启动服务。${NC}"
            return
        fi
    fi
    
    # 检查服务是否已加载
    if sudo_cmd launchctl list | grep -q "$SERVICE_NAME"; then
        echo -e "${YELLOW}服务已经加载，正在尝试重启...${NC}"
        restart_service
    else
        echo "正在加载并启动服务..."
        sudo_cmd launchctl load -w "$SERVICE_FILE"
        if [ $? -ne 0 ]; then
            echo -e "${RED}加载服务失败。请检查 ${SERVICE_FILE} 的内容和权限。${NC}"
        else
            echo -e "${GREEN}服务已启动。${NC}"
        fi
    fi
}

# 停止服务
stop_service() {
    if [ ! -f "$SERVICE_FILE" ]; then
        echo -e "${YELLOW}服务未安装。${NC}"
        return
    fi

    if ! sudo_cmd launchctl list | grep -q "$SERVICE_NAME"; then
        echo -e "${YELLOW}服务当前未加载。${NC}"
        return
    fi

    echo "正在停止并卸载服务..."
    sudo_cmd launchctl unload -w "$SERVICE_FILE"
    if [ $? -ne 0 ]; then
        echo -e "${RED}停止服务失败。${NC}"
    else
        echo -e "${GREEN}服务已停止。${NC}"
    fi
}

# 重启服务
restart_service() {
    # 如果服务文件不存在，说明是首次安装，直接调用启动即可
    if [ ! -f "$SERVICE_FILE" ]; then
        echo -e "${YELLOW}服务未安装，正在尝试首次启动...${NC}"
        start_service
        return
    fi
    
    echo "正在重启服务 (执行 stop/start)..."
    stop_service
    sleep 1 # Give time for the service to fully stop
    start_service
}

# 显示服务状态
show_status() {
    load_config # 确保 $CONFIG_FILE 是最新的
    echo "--- 当前配置 ---"
    # 显示模式
    local mode="未设置"
    if [ -f "${SCRIPT_DIR}/${CONFIG_MODE_FILE}" ]; then
        mode=$(cat "${SCRIPT_DIR}/${CONFIG_MODE_FILE}")
    fi
    echo -e "模式: ${YELLOW}${mode}${NC}"
    
    # 显示当前服务器
    local server_name="未配置"
    if [ -f "${SCRIPT_DIR}/${CURRENT_SERVER_FILE}" ]; then
        server_name=$(grep "ps=" "${SCRIPT_DIR}/${CURRENT_SERVER_FILE}" | cut -d'=' -f2-)
    fi
    echo -e "服务器: ${YELLOW}${server_name}${NC}"

    echo
    echo "--- 核心路径 ---"
    echo -e "主程序    : ${YELLOW}${SING_BOX_EXECUTABLE}${NC}"
    echo -e "配置文件  : ${YELLOW}${CONFIG_FILE}${NC}"
    echo -e "服务文件  : ${YELLOW}${SERVICE_FILE}${NC}"
    echo -e "执行的命令: ${YELLOW}${SING_BOX_EXECUTABLE} run -c ${CONFIG_FILE}${NC}"
    
    echo
    echo "--- 服务状态 ---"
    if [ ! -f "$SERVICE_FILE" ]; then
        echo -e "${YELLOW}服务 ${SERVICE_NAME} 未安装。${NC}"
        return
    fi
    
    local status_output
    status_output=$(sudo_cmd launchctl list | grep "$SERVICE_NAME")
    if [ -z "$status_output" ]; then
        echo -e "${RED}服务当前未加载或未运行。${NC}"
    else
        local pid
        pid=$(echo "$status_output" | awk '{print $1}')
        
        if [[ "$pid" == "-" || "$pid" == "" ]]; then
            echo "PID | Status | Label"
            echo -e "${RED}$status_output${NC}"
            echo -e "${RED}服务加载异常！(PID为'-')，可能已崩溃或配置错误。${NC}"
            echo -e "${RED}请检查错误日志: /var/log/sing-box.err${NC}"
        else
            echo -e "${GREEN}服务正在运行:${NC}"
            echo "PID | Status | Label"
            echo "$status_output"
        fi
    fi
    echo "------------------"
    echo "日志文件:"
    echo "输出: /var/log/sing-box.log"
    echo "错误: /var/log/sing-box.err"
}

# 清理环境 (卸载)
cleanup_environment() {
    echo -e "${RED}警告: 此操作将停止服务，并删除所有相关文件，包括：${NC}"
    echo -e "${YELLOW}- 服务文件: ${SERVICE_FILE}${NC}"
    echo -e "${YELLOW}- 程序目录: ${SCRIPT_DIR}${NC}"
    read -p "您确定要继续吗？这是一个不可逆的操作！[y/N]: " confirm
    
    if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
        echo "操作已取消。"
        return
    fi

    echo -e "\n正在开始清理..."

    # 1. 停止并卸载服务
    echo "--- 步骤 1/3: 停止服务 ---"
    stop_service

    # 2. 删除服务文件
    echo "--- 步骤 2/3: 删除 launchd 服务文件 ---"
    if [ -f "$SERVICE_FILE" ]; then
        sudo_cmd rm -f "$SERVICE_FILE"
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}成功删除: ${SERVICE_FILE}${NC}"
        else
            echo -e "${RED}删除失败: ${SERVICE_FILE}${NC}"
        fi
    else
        echo -e "${YELLOW}服务文件不存在，跳过。${NC}"
    fi

    # 3. 删除程序目录
    echo "--- 步骤 3/3: 删除程序目录 ---"
    if [ -d "$SCRIPT_DIR" ]; then
        sudo_cmd rm -rf "$SCRIPT_DIR"
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}成功删除: ${SCRIPT_DIR}${NC}"
        else
            echo -e "${RED}删除失败: ${SCRIPT_DIR}${NC}"
        fi
    else
        echo -e "${YELLOW}程序目录不存在，跳过。${NC}"
    fi

    echo -e "\n${GREEN}环境清理完成。脚本现在将退出。${NC}"
    echo "提示: 控制器脚本 '${BASH_SOURCE[0]}' 已保留，您可以手动删除它。"
    exit 0
}

# --- 菜单和主逻辑 ---

# 显示主菜单
show_menu() {
    clear
    echo "=============================================="
    echo "        sing-box for macOS 管理脚本"
    echo "=============================================="
    
    local mode="未设置"
    if [ -f "${SCRIPT_DIR}/${CONFIG_MODE_FILE}" ]; then
        mode=$(cat "${SCRIPT_DIR}/${CONFIG_MODE_FILE}")
    fi
    local server_name="未配置"
    if [ -f "${SCRIPT_DIR}/${CURRENT_SERVER_FILE}" ]; then
        server_name=$(grep "ps=" "${SCRIPT_DIR}/${CURRENT_SERVER_FILE}" | cut -d'=' -f2-)
    fi
    local status_color="${RED}"
    local status_text="未运行"
    if sudo launchctl list | grep -q "$SERVICE_NAME"; then
        status_color="${GREEN}"
        status_text="运行中"
    fi

    echo -e "状态: ${status_color}${status_text}${NC} | 模式: ${YELLOW}${mode}${NC} | 服务器: ${YELLOW}${server_name}${NC}"
    
    echo "----------------------------------------------"
    echo "1. 启动 / 重启服务"
    echo "2. 停止服务"
    echo "3. 切换服务器 (从订阅更新)"
    echo "4. 更改订阅链接"
    echo "5. 切换模式 (白名单/全局)"
    echo "6. 查看状态"
    echo "7. 清理环境 (卸载)"
    echo "q. 退出"
    echo "----------------------------------------------"
}

# --- 脚本入口 ---
check_root
check_and_disable_gatekeeper
initialize_environment
detect_macos_version_and_set_executable
load_config

# 检查是否需要进行首次设置（即无订阅链接）
if [ ! -s "${SCRIPT_DIR}/${SUB_URL_FILE}" ]; then
    echo -e "${YELLOW}未检测到有效的订阅链接，开始首次设置流程...${NC}"
    update_server_config
    echo -e "\n${GREEN}首次设置完成。按任意键进入主菜单...${NC}"
    read -n 1 -s
fi

# 主循环
while true; do
    show_menu
    read -p "请选择一个操作: " choice
    case "$choice" in
        1)
            start_service
            ;;
        2)
            stop_service
            ;;
        3)
            update_server_config
            ;;
        4)
            get_subscription_url
            ;;
        5)
            if select_mode; then
                echo "模式已更改，正在更新服务文件并重启..."
                if create_launchd_service_file; then
                    restart_service
                else
                    echo -e "${RED}更新服务文件失败，无法重启服务。${NC}"
                fi
            fi
            ;;
        6)
            show_status
            ;;
        7)
            cleanup_environment
            ;;
        q|Q)
            echo "正在退出..."
            exit 0
            ;;
        *)
            echo -e "${RED}无效的选项，请重试。${NC}"
            ;;
    esac
    echo
    read -p "按任意键返回主菜单..." -n 1 -s
done
